import type { CurrencyCode } from "@/types";
import { adjustRateByPercent, type Rate } from "./money";

/**
 * Currency conversion against a fixed prototype rate.
 *
 * The rate is fixed so award arithmetic is reproducible: a buyer re-running a
 * scenario next week must get the same number. Every converted value is marked
 * INFERRED rather than VERIFIED, because the rupee figure depends on an
 * assumption the supplier's document does not make.
 */

export interface FxTable {
  INR: number;
  USD: number;
}

export interface ConversionResult {
  rate: Rate;
  /** Null when no conversion was applied. */
  derivation: string | null;
  /** True when the value depends on an assumed rate. */
  assumed: boolean;
}

export function convertToInr(params: {
  rate: Rate;
  from: CurrencyCode;
  fx: FxTable;
  /** e.g. +3 to model the rupee weakening 3%. */
  adjustmentPercent?: number;
}): ConversionResult {
  const { rate, from, fx } = params;

  if (from === "INR") {
    return { rate, derivation: null, assumed: false };
  }

  const baseRate = fx[from];
  const effective = params.adjustmentPercent
    ? baseRate * (1 + params.adjustmentPercent / 100)
    : baseRate;

  const converted = Math.round(rate * effective);
  const original = rate / 1_000_000;

  return {
    rate: params.adjustmentPercent
      ? adjustRateByPercent(Math.round(rate * baseRate), params.adjustmentPercent)
      : converted,
    derivation:
      `$${original.toFixed(2)} × ₹${effective.toFixed(2)} = ₹${((original * effective)).toFixed(2)}` +
      (params.adjustmentPercent
        ? ` (rate moved ${params.adjustmentPercent > 0 ? "+" : ""}${params.adjustmentPercent}%)`
        : ""),
    assumed: true,
  };
}

/** Shown wherever a converted value affects a number on screen. */
export function fxDisclosure(fx: FxTable): string {
  return `1 USD = ₹${fx.USD} — prototype rate, not live market data`;
}
