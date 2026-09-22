import "server-only";
import { getSql } from "@/lib/db/sql";
import { env } from "@/lib/config/env";
import type { ConfidenceState, CurrencyCode, Freight } from "@/types";
import { normalizeQuote } from "./normalize";
import { rateToRupees } from "./money";

/**
 * Builds the comparable layer from the raw one.
 *
 * Reads `vendor_quotes` — what the documents said — and writes
 * `commercial_truth` — what can be compared. Deterministic and idempotent: the
 * same raw data always produces the same truth, and re-running replaces rather
 * than accumulates. No model is called.
 */

export interface TruthBuildResult {
  rfqId: string;
  written: number;
  blocked: number;
  byConfidence: Record<ConfidenceState, number>;
}

interface RawRow {
  id: string;
  rfq_line_id: string;
  vendor_id: string;
  quoted_price: number | null;
  currency: string | null;
  quoted_unit: string | null;
  quantity_basis: number | null;
  freight_status: Freight["status"];
  freight_amount: number | null;
  freight_currency: string | null;
  freight_basis: string | null;
  taxes_included: boolean | null;
  tax_rate: number | null;
  confidence: ConfidenceState;
  rfx_unit: string;
}

export async function buildCommercialTruth(rfqId: string): Promise<TruthBuildResult> {
  const sql = getSql();
  const fx = { INR: 1, USD: env.FX_USD_INR };

  const [rfq] = await sql<{ commercial_terms: { currency?: string } }[]>`
    select commercial_terms from rfqs where id = ${rfqId}
  `;
  const rfxCurrency = (rfq?.commercial_terms?.currency ?? "INR") as CurrencyCode;

  const rows = await sql<RawRow[]>`
    select q.id, q.rfq_line_id, q.vendor_id, q.quoted_price, q.currency, q.quoted_unit,
           q.quantity_basis, q.freight_status::text as freight_status, q.freight_amount,
           q.freight_currency, q.freight_basis, q.taxes_included, q.tax_rate,
           q.confidence::text as confidence, li.unit as rfx_unit
      from vendor_quotes q
      join rfq_line_items li on li.id = q.rfq_line_id
     where q.rfq_id = ${rfqId} and q.rfq_line_id is not null
       and q.match_status = 'MATCHED'
     order by li.position, q.vendor_id
  `;

  const byConfidence: Record<ConfidenceState, number> = {
    VERIFIED: 0,
    INFERRED: 0,
    REVIEW_REQUIRED: 0,
    BLOCKED: 0,
    CONFLICT: 0,
  };
  let blocked = 0;

  await sql`delete from commercial_truth where rfq_id = ${rfqId}`;

  for (const row of rows) {
    const freight: Freight = {
      status: row.freight_status,
      amount: row.freight_amount ?? undefined,
      currency: (row.freight_currency as CurrencyCode | null) ?? undefined,
      basis: row.freight_basis ?? undefined,
    };

    const normalized = normalizeQuote({
      quotedPrice: row.quoted_price,
      currency: (row.currency as CurrencyCode | null) ?? null,
      quotedUnit: row.quoted_unit,
      quantityBasis: row.quantity_basis,
      freight,
      rfxUnit: row.rfx_unit,
      rfxCurrency,
      extractionConfidence: row.confidence,
      fx,
    });

    byConfidence[normalized.confidence] += 1;
    const isBlocked = normalized.confidence === "BLOCKED";
    if (isBlocked) blocked += 1;

    const derivation = [
      ...normalized.derivation,
      ...normalized.blockers.map((b) => `${b.reason} ${b.resolution}`),
    ].join(" ");

    await sql`
      insert into commercial_truth (
        rfq_id, rfq_line_id, vendor_id, vendor_quote_id,
        quoted_amount, quoted_currency, quoted_unit,
        normalized_amount, normalized_currency, normalized_unit,
        derivation, freight_status, freight_amount, freight_currency, freight_basis,
        taxes_included, tax_rate, confidence
      ) values (
        ${rfqId}, ${row.rfq_line_id}, ${row.vendor_id}, ${row.id},
        ${row.quoted_price ?? 0}, ${row.currency ?? rfxCurrency}, ${row.quoted_unit ?? "unknown"},
        -- NULL when normalization was not safe. Never a plausible stand-in.
        ${isBlocked ? null : rateToRupees(normalized.unitRateInr)},
        ${isBlocked ? null : rfxCurrency},
        ${isBlocked ? null : row.rfx_unit},
        ${derivation || null},
        ${freight.status}, ${row.freight_amount}, ${row.freight_currency}, ${row.freight_basis},
        ${row.taxes_included}, ${row.tax_rate}, ${normalized.confidence}
      )
      on conflict (rfq_line_id, vendor_id) do update set
        normalized_amount = excluded.normalized_amount,
        derivation        = excluded.derivation,
        confidence        = excluded.confidence,
        computed_at       = now()
    `;
  }

  return { rfqId, written: rows.length, blocked, byConfidence };
}
