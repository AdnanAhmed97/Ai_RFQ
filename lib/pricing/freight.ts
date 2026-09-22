import type { Freight } from "@/types";
import { rupeesToRate, type Rate } from "./money";

/**
 * Freight resolution.
 *
 * Freight is the most common way a comparison goes quietly wrong: one supplier
 * quotes delivered, another ex-works, and a naive total makes the second look
 * cheaper. Nothing is assumed here. A supplier who says "freight extra" without
 * a rate leaves landed cost unresolved, and the award engine is told so rather
 * than being handed a zero.
 */

export type FreightResolution =
  | {
      status: "RESOLVED";
      /** Freight attributable to one unit, in rate units. Zero when included. */
      ratePerUnit: Rate;
      derivation: string;
    }
  | {
      status: "UNRESOLVED";
      reason: string;
      resolution: string;
    };

export function resolveFreight(params: {
  freight: Freight;
  /** e.g. +5 to model a 5% freight rise. */
  adjustmentPercent?: number;
}): FreightResolution {
  const { freight } = params;

  if (freight.status === "INCLUDED") {
    return {
      status: "RESOLVED",
      ratePerUnit: 0,
      derivation: "Freight stated as included in the quoted rate.",
    };
  }

  if (freight.status === "UNKNOWN") {
    return {
      status: "UNRESOLVED",
      reason: "The document does not state how freight is treated.",
      resolution:
        "Ask the supplier whether rates are delivered or ex-works, and at what charge.",
    };
  }

  // EXTRA, with or without a figure.
  if (freight.amount === undefined || freight.amount === null) {
    return {
      status: "UNRESOLVED",
      reason: "Freight is excluded and no rate is given.",
      resolution: "Ask the supplier for a delivered rate, or a freight charge per unit.",
    };
  }

  // Only a per-unit basis can be attributed to a line without allocation rules.
  const basis = (freight.basis ?? "").toLowerCase();
  const perUnit = /per\s*(pc|pcs|piece|pieces|unit|no|nos|each)/.test(basis) || basis === "";

  if (!perUnit) {
    return {
      status: "UNRESOLVED",
      reason: `Freight is quoted ${freight.basis}, which cannot be attributed to a line without an allocation rule.`,
      resolution: "Agree how the freight charge is split across lines, or ask for a per-unit rate.",
    };
  }

  const adjusted = params.adjustmentPercent
    ? freight.amount * (1 + params.adjustmentPercent / 100)
    : freight.amount;

  return {
    status: "RESOLVED",
    ratePerUnit: rupeesToRate(adjusted),
    derivation:
      `Freight extra at ₹${freight.amount.toFixed(2)} per unit` +
      (params.adjustmentPercent
        ? `, adjusted ${params.adjustmentPercent > 0 ? "+" : ""}${params.adjustmentPercent}% to ₹${adjusted.toFixed(2)}`
        : ""),
  };
}
