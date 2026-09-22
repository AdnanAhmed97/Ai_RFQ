import type { ConfidenceState, CurrencyCode, Freight } from "@/types";
import { convertToInr, type FxTable } from "./currency";
import { resolveFreight } from "./freight";
import { normalizeUnit } from "./units";
import type { Rate } from "./money";

/**
 * Turns one raw quote into a comparable record, or refuses to.
 *
 * This is where the product's central promise is kept or broken. Every path
 * that cannot produce an honest per-unit rupee rate returns BLOCKED with the
 * reason and what would unblock it — never a plausible number.
 */

export interface NormalizationInput {
  quotedPrice: number | null;
  currency: CurrencyCode | null;
  quotedUnit: string | null;
  quantityBasis: number | null;
  freight: Freight;
  rfxUnit: string;
  rfxCurrency: CurrencyCode;
  /** The extraction's own confidence. A shaky reading cannot become VERIFIED. */
  extractionConfidence: ConfidenceState;
  fx: FxTable;
  freightAdjustmentPercent?: number;
  fxAdjustmentPercent?: number;
}

export interface NormalizedQuote {
  /** Ex-freight price for one RFx unit, in INR. */
  unitRateInr: Rate;
  /** Freight per unit, when resolvable. Null leaves landed cost unresolved. */
  freightRateInr: Rate | null;
  /** unitRate + freight, when freight resolved. */
  landedRateInr: Rate | null;
  confidence: ConfidenceState;
  /** Every step, in order, for the evidence drawer. */
  derivation: string[];
  /** Populated when the value cannot be used in an award as it stands. */
  blockers: { reason: string; resolution: string }[];
}

export function normalizeQuote(input: NormalizationInput): NormalizedQuote {
  const derivation: string[] = [];
  const blockers: { reason: string; resolution: string }[] = [];

  if (input.quotedPrice === null) {
    return {
      unitRateInr: 0,
      freightRateInr: null,
      landedRateInr: null,
      confidence: "BLOCKED",
      derivation: [],
      blockers: [
        {
          reason: "No price was extracted for this line.",
          resolution: "Check the source document, or ask the supplier to quote it.",
        },
      ],
    };
  }

  // --- Unit ---------------------------------------------------------------
  const unit = normalizeUnit({
    quotedPrice: input.quotedPrice,
    quotedUnit: input.quotedUnit,
    quantityBasis: input.quantityBasis,
    rfxUnit: input.rfxUnit,
  });

  if (unit.status === "BLOCKED") {
    return {
      unitRateInr: 0,
      freightRateInr: null,
      landedRateInr: null,
      confidence: "BLOCKED",
      derivation: [],
      blockers: [{ reason: unit.reason, resolution: unit.resolution }],
    };
  }

  derivation.push(unit.derivation);
  let rate = unit.rate;
  let confidence: ConfidenceState = unit.confidence;

  // --- Currency -----------------------------------------------------------
  const currency = input.currency ?? input.rfxCurrency;
  const converted = convertToInr({
    rate,
    from: currency,
    fx: input.fx,
    adjustmentPercent: input.fxAdjustmentPercent,
  });
  rate = converted.rate;

  if (converted.derivation) {
    derivation.push(converted.derivation);
    // A rupee figure resting on an assumed rate is an interpretation.
    confidence = "INFERRED";
  }

  // --- Freight ------------------------------------------------------------
  const freight = resolveFreight({
    freight: input.freight,
    adjustmentPercent: input.freightAdjustmentPercent,
  });

  let freightRate: Rate | null = null;
  if (freight.status === "RESOLVED") {
    freightRate = freight.ratePerUnit;
    derivation.push(freight.derivation);
  } else {
    blockers.push({ reason: freight.reason, resolution: freight.resolution });
  }

  // --- Extraction confidence ceiling --------------------------------------
  // Arithmetic cannot improve on the reading it started from.
  if (input.extractionConfidence === "CONFLICT") confidence = "CONFLICT";
  else if (input.extractionConfidence === "REVIEW_REQUIRED") confidence = "REVIEW_REQUIRED";
  else if (input.extractionConfidence === "BLOCKED") confidence = "BLOCKED";
  else if (input.extractionConfidence === "INFERRED" && confidence === "VERIFIED") {
    confidence = "INFERRED";
  }

  return {
    unitRateInr: rate,
    freightRateInr: freightRate,
    landedRateInr: freightRate === null ? null : rate + freightRate,
    confidence,
    derivation,
    blockers,
  };
}
