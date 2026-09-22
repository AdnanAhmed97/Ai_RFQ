import type { ConfidenceState } from "@/types";
import { rupeesToRate, type Rate } from "./money";

/**
 * Unit normalization.
 *
 * The one rule that governs this file: a quoted unit is converted only when the
 * document states everything the conversion needs. "₹1,250 per box" with no
 * pack size anywhere is BLOCKED, not ₹104.17 per piece. Inventing the pack size
 * would produce a number that looks identical to a real one and is wrong.
 */

export interface UnitNormalizationInput {
  quotedPrice: number;
  /** The basis exactly as printed: "per piece", "per 100 pcs", "per bundle". */
  quotedUnit: string | null;
  /** Units per quoted unit, when the document states it. */
  quantityBasis: number | null;
  /** The unit the RFx asked to be quoted in. */
  rfxUnit: string;
}

export type UnitNormalization =
  | {
      status: "NORMALIZED";
      /** Price for one RFx unit. */
      rate: Rate;
      /** Plain-language arithmetic, shown in the evidence drawer. */
      derivation: string;
      confidence: Extract<ConfidenceState, "VERIFIED" | "INFERRED">;
    }
  | {
      status: "BLOCKED";
      reason: string;
      /** What would unblock it, in the buyer's terms. */
      resolution: string;
    };

/** Bases that need a multiplier before they can be compared per unit. */
const MULTIPLE_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /per\s*(\d+)\s*(?:pcs?|pieces?|nos?)/i, label: "explicit count" },
  { pattern: /\/\s*(\d+)\s*(?:pcs?|pieces?|nos?)/i, label: "explicit count" },
];

/** Bases that imply a container whose size the document must state. */
const CONTAINER_PATTERN =
  /\b(bundle|box|bale|pack|carton|case|set of|roll of|bag)\b/i;

/** A stated per-unit basis: "per piece", "per pc". */
const SINGLE_PATTERN =
  /\bper\s*(pc|pcs|piece|pieces|no|nos|unit|units|each|ea|set|sets|roll|rolls|sheet|sheets)\b/i;

/**
 * A bare unit token, with no "per".
 *
 * Spreadsheets carry the basis in a UOM column, so the cell reads "Nos" rather
 * than "per piece" — "Nos" being the Indian trade shorthand for numbers, i.e.
 * pieces. Requiring the word "per" blocked 42 perfectly ordinary lines.
 */
const BARE_UNIT_PATTERN =
  /^(pc|pcs|piece|pieces|no|nos|unit|units|each|ea|set|sets|roll|rolls|sheet|sheets|kg|mt)$/i;

export function normalizeUnit(input: UnitNormalizationInput): UnitNormalization {
  const unit = (input.quotedUnit ?? "").trim();
  const price = input.quotedPrice;

  if (!unit) {
    // No stated basis at all. Assuming the RFx basis would be a guess.
    return {
      status: "BLOCKED",
      reason: "The document does not state what the price is per.",
      resolution: `Confirm with the supplier whether this is per ${input.rfxUnit}.`,
    };
  }

  // "per 100 pcs" — the multiplier is printed, so the division is exact.
  for (const { pattern } of MULTIPLE_PATTERNS) {
    const match = pattern.exec(unit);
    if (match?.[1]) {
      const count = Number(match[1]);
      if (count > 0) {
        return {
          status: "NORMALIZED",
          rate: rupeesToRate(price / count),
          derivation: `₹${price.toLocaleString("en-IN")} ÷ ${count} = ₹${(price / count).toFixed(2)} per ${input.rfxUnit}`,
          confidence: "VERIFIED",
        };
      }
    }
  }

  // A container basis. Convertible only if the document states its contents.
  if (CONTAINER_PATTERN.test(unit) && !SINGLE_PATTERN.test(unit)) {
    if (input.quantityBasis && input.quantityBasis > 0) {
      return {
        status: "NORMALIZED",
        rate: rupeesToRate(price / input.quantityBasis),
        derivation: `₹${price.toLocaleString("en-IN")} ÷ ${input.quantityBasis} per ${unit.replace(/^per\s*/i, "")} = ₹${(price / input.quantityBasis).toFixed(2)} per ${input.rfxUnit}`,
        confidence: "VERIFIED",
      };
    }
    return {
      status: "BLOCKED",
      reason: `Quoted ${unit}, and the document does not state how many ${input.rfxUnit}s that contains.`,
      resolution: "Ask the supplier for the pack quantity, then this line can be compared.",
    };
  }

  // Already per unit.
  if (
    SINGLE_PATTERN.test(unit) ||
    BARE_UNIT_PATTERN.test(unit) ||
    unit.toLowerCase() === input.rfxUnit.toLowerCase()
  ) {
    return {
      status: "NORMALIZED",
      rate: rupeesToRate(price),
      derivation: `Quoted ${unit}; no conversion needed.`,
      confidence: "VERIFIED",
    };
  }

  // Unrecognised basis. Treating it as per-unit would be a silent assumption.
  return {
    status: "BLOCKED",
    reason: `The basis "${unit}" could not be related to the requested unit (${input.rfxUnit}).`,
    resolution: "Confirm the pricing basis with the supplier.",
  };
}
