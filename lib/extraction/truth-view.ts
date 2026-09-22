import "server-only";
import { getSql } from "@/lib/db/sql";
import type { ConfidenceState } from "@/types";

/**
 * The comparison grid: 30 lines against 5 suppliers, read as one surface.
 *
 * A cell with no normalized value keeps its quoted value and its reason, so the
 * buyer sees *why* a line cannot be compared rather than an empty square.
 */
export interface TruthCell {
  vendorId: string;
  truthId: string;
  quotedAmount: number;
  quotedCurrency: string;
  quotedUnit: string;
  /** Null when normalization was not safe. */
  normalizedAmount: number | null;
  derivation: string | null;
  freightStatus: string;
  confidence: ConfidenceState;
  /** Cheapest comparable cell on this row. */
  lowest: boolean;
  evidence: {
    documentName: string;
    sheet: string | null;
    page: number | null;
    row: number | null;
    column: string | null;
    sourceText: string | null;
  } | null;
}

export interface TruthRow {
  rfqLineId: string;
  position: number;
  skuCode: string;
  description: string;
  quantity: number;
  unit: string;
  cells: Map<string, TruthCell>;
  /** Suppliers with a comparable price for this line. */
  comparableCount: number;
}

export interface TruthView {
  rfqId: string;
  title: string;
  vendors: { id: string; shortLabel: string; name: string; eligible: boolean | null }[];
  rows: TruthRow[];
  totals: {
    lines: number;
    expectedCells: number;
    extractedCells: number;
    comparableCells: number;
    blockedCells: number;
    openIssues: number;
    blockerIssues: number;
    byConfidence: Record<ConfidenceState, number>;
  };
}

export async function loadTruthView(rfqId: string): Promise<TruthView | null> {
  const sql = getSql();

  const [rfq] = await sql<{ id: string; title: string }[]>`
    select id, title from rfqs where id = ${rfqId}
  `;
  if (!rfq) return null;

  const vendors = await sql<{ id: string; short_label: string; name: string }[]>`
    select id, short_label, name from vendors where rfq_id = ${rfqId} order by short_label
  `;

  const lines = await sql<
    { id: string; position: number; sku_code: string; description: string; quantity: number; unit: string }[]
  >`
    select id, position, sku_code, description, quantity, unit
      from rfq_line_items where rfq_id = ${rfqId} order by position
  `;

  const cells = await sql<
    {
      id: string;
      rfq_line_id: string;
      vendor_id: string;
      quoted_amount: number;
      quoted_currency: string;
      quoted_unit: string;
      normalized_amount: number | null;
      derivation: string | null;
      freight_status: string;
      confidence: ConfidenceState;
      filename: string | null;
      sheet: string | null;
      page: number | null;
      row: number | null;
      column: string | null;
      source_text: string | null;
    }[]
  >`
    select ct.id, ct.rfq_line_id, ct.vendor_id, ct.quoted_amount, ct.quoted_currency,
           ct.quoted_unit, ct.normalized_amount, ct.derivation,
           ct.freight_status::text as freight_status, ct.confidence::text as confidence,
           d.filename, e.sheet, e.page, e."row", e."column", e.source_text
      from commercial_truth ct
      left join vendor_quotes q on q.id = ct.vendor_quote_id
      left join documents d on d.id = q.source_document_id
      left join lateral (
        select sheet, page, "row", "column", source_text from evidence ev
         where ev.subject_type = 'VENDOR_QUOTE' and ev.subject_id = q.id limit 1
      ) e on true
     where ct.rfq_id = ${rfqId}
  `;

  const eligibility = await sql<{ vendor_id: string; failed: number; undetermined: number }[]>`
    select qa.vendor_id,
           count(*) filter (where qa.passes is false)::int as failed,
           count(*) filter (where qa.passes is null)::int as undetermined
      from questionnaire_answers qa
      join questionnaire_questions qq on qq.id = qa.question_id
     where qq.rfq_id = ${rfqId} and qq.mandatory_for_eligibility
     group by qa.vendor_id
  `;
  const eligibilityByVendor = new Map(eligibility.map((e) => [e.vendor_id, e]));

  const [issues] = await sql<{ total: number; blockers: number }[]>`
    select count(*)::int as total,
           count(*) filter (where severity = 'BLOCKER')::int as blockers
      from commercial_issues where rfq_id = ${rfqId} and resolved_at is null
  `;

  const byConfidence: Record<ConfidenceState, number> = {
    VERIFIED: 0,
    INFERRED: 0,
    REVIEW_REQUIRED: 0,
    BLOCKED: 0,
    CONFLICT: 0,
  };

  const rows: TruthRow[] = lines.map((line) => {
    const lineCells = cells.filter((c) => c.rfq_line_id === line.id);
    const comparable = lineCells.filter((c) => c.normalized_amount !== null);
    const lowestValue =
      comparable.length > 0
        ? Math.min(...comparable.map((c) => Number(c.normalized_amount)))
        : null;

    const map = new Map<string, TruthCell>();
    for (const cell of lineCells) {
      byConfidence[cell.confidence] += 1;
      const normalized = cell.normalized_amount === null ? null : Number(cell.normalized_amount);
      map.set(cell.vendor_id, {
        vendorId: cell.vendor_id,
        truthId: cell.id,
        quotedAmount: Number(cell.quoted_amount),
        quotedCurrency: cell.quoted_currency,
        quotedUnit: cell.quoted_unit,
        normalizedAmount: normalized,
        derivation: cell.derivation,
        freightStatus: cell.freight_status,
        confidence: cell.confidence,
        lowest:
          normalized !== null && lowestValue !== null && Math.abs(normalized - lowestValue) < 1e-9,
        evidence: cell.filename
          ? {
              documentName: cell.filename,
              sheet: cell.sheet,
              page: cell.page,
              row: cell.row,
              column: cell.column,
              sourceText: cell.source_text,
            }
          : null,
      });
    }

    return {
      rfqLineId: line.id,
      position: line.position,
      skuCode: line.sku_code,
      description: line.description,
      quantity: Number(line.quantity),
      unit: line.unit,
      cells: map,
      comparableCount: comparable.length,
    };
  });

  return {
    rfqId: rfq.id,
    title: rfq.title,
    vendors: vendors.map((v) => {
      const e = eligibilityByVendor.get(v.id);
      return {
        id: v.id,
        shortLabel: v.short_label,
        name: v.name,
        // Null when eligibility has not been reviewed yet — not false.
        eligible: !e ? null : e.failed > 0 ? false : e.undetermined > 0 ? null : true,
      };
    }),
    rows,
    totals: {
      lines: lines.length,
      expectedCells: lines.length * vendors.length,
      extractedCells: cells.length,
      comparableCells: cells.filter((c) => c.normalized_amount !== null).length,
      blockedCells: cells.filter((c) => c.normalized_amount === null).length,
      openIssues: issues?.total ?? 0,
      blockerIssues: issues?.blockers ?? 0,
      byConfidence,
    },
  };
}
