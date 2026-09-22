/**
 * Cross-cutting domain primitives.
 *
 * These encode the product's two central ideas:
 *  1. uncertainty is a first-class state, not a number; and
 *  2. every material commercial value carries provenance.
 */

/**
 * The confidence model (spec §29).
 *
 * Deliberately NOT a 0-1 score. A percentage invites false precision and is
 * unfalsifiable; these five states each imply a different buyer action.
 */
export const CONFIDENCE_STATES = [
  /** Directly supported by source text and safely normalized. */
  "VERIFIED",
  /** A plausible semantic interpretation that the source does not state outright. */
  "INFERRED",
  /** A human must confirm before this value is used in an award. */
  "REVIEW_REQUIRED",
  /** Insufficient information to normalize. Never guessed around. */
  "BLOCKED",
  /** Two or more sources disagree. */
  "CONFLICT",
] as const;

export type ConfidenceState = (typeof CONFIDENCE_STATES)[number];

/** States in which a value may be counted toward a comparable commercial total. */
export const COMPARABLE_CONFIDENCE_STATES: readonly ConfidenceState[] = [
  "VERIFIED",
  "INFERRED",
];

export function isComparable(state: ConfidenceState): boolean {
  return COMPARABLE_CONFIDENCE_STATES.includes(state);
}

/** Lifecycle of any AI operation, surfaced in the UI (spec §49). */
export const AI_OPERATION_STATUSES = [
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "PARTIAL",
  "REVIEW_REQUIRED",
  "FAILED",
] as const;

export type AIOperationStatus = (typeof AI_OPERATION_STATUSES)[number];

export const SUPPORTED_CURRENCIES = ["INR", "USD"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * A quantity of money. Amounts are held as numbers at the edges and converted
 * to integer minor units inside the pricing engine (Slice 6) — never summed as
 * floats in application code.
 */
export interface Money {
  amount: number;
  currency: CurrencyCode;
}

/** A price expressed per some unit, e.g. ₹4,200 per 100 pieces. */
export interface UnitPrice {
  amount: number;
  currency: CurrencyCode;
  /** The unit as quoted, verbatim from the vendor where possible. */
  unit: string;
  /** How many base units one `unit` contains, when known. 100 for "per 100 pieces". */
  quantityBasis?: number;
  /** The base unit, e.g. "piece". */
  quantityBasisUnit?: string;
}

/** A value that may legitimately be absent. `NOT_FOUND` is never coerced to 0. */
export type Resolvable<T> =
  | { status: "RESOLVED"; value: T }
  | { status: "NOT_FOUND" }
  | { status: "BLOCKED"; reason: string };

export type ISODateString = string;
export type UUID = string;
