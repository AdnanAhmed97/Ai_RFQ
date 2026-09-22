import "server-only";
import { getSql } from "@/lib/db/sql";
import { env } from "@/lib/config/env";
import { rupeesToRate } from "./money";
import type { AwardLine, ComparableQuote } from "./award";
import { evaluateEligibility, type AnswerVerdict, type EligibilityResult } from "./eligibility";
import { fxDisclosure } from "./currency";

/**
 * Loads everything an award calculation needs, in one place.
 *
 * The decision tools all operate on this snapshot, so a scenario and the table
 * the buyer is looking at can never disagree about what the data says.
 */
export interface AnalysisSnapshot {
  rfqId: string;
  title: string;
  lines: (AwardLine & { description: string; unit: string; position: number })[];
  quotes: ComparableQuote[];
  eligibility: EligibilityResult[];
  vendors: { id: string; shortLabel: string; name: string }[];
  fxNote: string;
  hasConvertedValues: boolean;
}

export async function loadAnalysisSnapshot(rfqId: string): Promise<AnalysisSnapshot | null> {
  const sql = getSql();

  const [rfq] = await sql<{ id: string; title: string }[]>`
    select id, title from rfqs where id = ${rfqId}
  `;
  if (!rfq) return null;

  const lineRows = await sql<
    { id: string; position: number; sku_code: string; description: string; quantity: number; unit: string }[]
  >`
    select id, position, sku_code, description, quantity, unit
      from rfq_line_items where rfq_id = ${rfqId} order by position
  `;

  const vendors = await sql<{ id: string; short_label: string; name: string }[]>`
    select id, short_label, name from vendors where rfq_id = ${rfqId} order by short_label
  `;

  const truthRows = await sql<
    {
      rfq_line_id: string;
      vendor_id: string;
      normalized_amount: number | null;
      freight_status: string;
      freight_amount: number | null;
      confidence: ComparableQuote["confidence"];
      quoted_currency: string;
    }[]
  >`
    select rfq_line_id, vendor_id, normalized_amount, freight_status::text as freight_status,
           freight_amount, confidence::text as confidence, quoted_currency
      from commercial_truth where rfq_id = ${rfqId}
  `;

  const quotes: ComparableQuote[] = truthRows.map((row) => {
    const unitRate = row.normalized_amount === null ? 0 : rupeesToRate(Number(row.normalized_amount));
    // Landed cost exists only where freight actually resolved.
    const freightRate =
      row.freight_status === "INCLUDED"
        ? 0
        : row.freight_status === "EXTRA" && row.freight_amount !== null
          ? rupeesToRate(Number(row.freight_amount))
          : null;

    return {
      rfqLineId: row.rfq_line_id,
      vendorId: row.vendor_id,
      unitRateInr: unitRate,
      landedRateInr:
        row.normalized_amount === null || freightRate === null ? null : unitRate + freightRate,
      confidence: row.confidence,
    };
  });

  const verdictRows = await sql<
    {
      vendor_id: string;
      question_id: string;
      position: number;
      question: string;
      mandatory_for_eligibility: boolean;
      passes: boolean | null;
    }[]
  >`
    select qa.vendor_id, qa.question_id, qq.position, qq.question,
           qq.mandatory_for_eligibility, qa.passes
      from questionnaire_answers qa
      join questionnaire_questions qq on qq.id = qa.question_id
     where qq.rfq_id = ${rfqId}
  `;

  const eligibility = vendors.map((vendor) => {
    const verdicts: AnswerVerdict[] = verdictRows
      .filter((row) => row.vendor_id === vendor.id)
      .map((row) => ({
        questionId: row.question_id,
        ref: `Q${row.position}`,
        question: row.question,
        mandatoryForEligibility: row.mandatory_for_eligibility,
        passes: row.passes,
        reasoning: null,
        // A row exists, so the supplier answered. Whether it satisfies the
        // requirement is a separate question the review has yet to settle.
        answered: true,
      }));
    return evaluateEligibility({ vendorId: vendor.id, verdicts });
  });

  return {
    rfqId: rfq.id,
    title: rfq.title,
    lines: lineRows.map((row) => ({
      rfqLineId: row.id,
      skuCode: row.sku_code,
      quantity: Number(row.quantity),
      description: row.description,
      unit: row.unit,
      position: row.position,
    })),
    quotes,
    eligibility,
    vendors: vendors.map((v) => ({ id: v.id, shortLabel: v.short_label, name: v.name })),
    fxNote: fxDisclosure({ INR: 1, USD: env.FX_USD_INR }),
    hasConvertedValues: truthRows.some((r) => r.quoted_currency !== "INR"),
  };
}
