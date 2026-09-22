import type { UUID } from "@/types";
import { extend, sum, type Paise, type Rate } from "./money";

/**
 * Award optimization.
 *
 * One rule governs every function here: a line that cannot be compared safely
 * is reported as unawarded, with the reason, and the total is marked incomplete.
 * It is never skipped quietly and a missing quote is never treated as zero —
 * that would make the supplier who declined to quote look cheapest.
 */

export interface ComparableQuote {
  rfqLineId: UUID;
  vendorId: UUID;
  /** Ex-freight, INR, per RFx unit. */
  unitRateInr: Rate;
  /** Null when freight could not be resolved. */
  landedRateInr: Rate | null;
  confidence: "VERIFIED" | "INFERRED" | "REVIEW_REQUIRED" | "BLOCKED" | "CONFLICT";
}

export interface AwardLine {
  rfqLineId: UUID;
  skuCode: string;
  quantity: number;
}

export interface AwardAllocationResult {
  rfqLineId: UUID;
  vendorId: UUID;
  quantity: number;
  unitRateInr: Rate;
  lineValuePaise: Paise;
  /** Which basis was used; stated because it changes the comparison. */
  basis: "LANDED" | "EX_FREIGHT";
  confidence: ComparableQuote["confidence"];
  /** Runner-up margin, for "how close was this". */
  marginOverNextPaise?: Paise;
}

export interface UnawardedLineResult {
  rfqLineId: UUID;
  skuCode: string;
  reason: string;
}

export interface AwardResult {
  allocations: AwardAllocationResult[];
  unawarded: UnawardedLineResult[];
  totalPaise: Paise;
  /** False when any line could not be awarded. The total is then partial. */
  complete: boolean;
  /** Share of awarded value resting on VERIFIED readings, 0-1. */
  evidenceCoverage: number;
  /** Lines whose award rests on an INFERRED or weaker reading. */
  inferredLineCount: number;
}

export interface AwardOptions {
  /**
   * Suppliers permitted to receive award.
   *
   * `null` means no eligibility filter. An empty ARRAY means no supplier
   * qualifies — which must produce an empty award, not an unfiltered one.
   * Conflating the two silently awarded every line to an ineligible supplier.
   */
  eligibleVendorIds: UUID[] | null;
  /** Compare on landed cost. Lines with unresolved freight then cannot be awarded. */
  includeFreight: boolean;
  /** Award every line to one supplier. */
  singleVendorId?: UUID;
  /** Confidence states usable in an award. */
  usableConfidence?: ComparableQuote["confidence"][];
}

const DEFAULT_USABLE: ComparableQuote["confidence"][] = ["VERIFIED", "INFERRED"];

function rateFor(quote: ComparableQuote, includeFreight: boolean): Rate | null {
  return includeFreight ? quote.landedRateInr : quote.unitRateInr;
}

/**
 * Cheapest valid supplier per line.
 *
 * Every line is decided independently, which is what a split award is; a line
 * with no valid quote lands in `unawarded` rather than being dropped.
 */
export function calculateAward(params: {
  lines: AwardLine[];
  quotes: ComparableQuote[];
  options: AwardOptions;
}): AwardResult {
  const { lines, quotes, options } = params;
  const usable = new Set(options.usableConfidence ?? DEFAULT_USABLE);
  const filterByEligibility = options.eligibleVendorIds !== null;
  const eligible = new Set(options.eligibleVendorIds ?? []);

  const byLine = new Map<UUID, ComparableQuote[]>();
  for (const quote of quotes) {
    const list = byLine.get(quote.rfqLineId) ?? [];
    list.push(quote);
    byLine.set(quote.rfqLineId, list);
  }

  const allocations: AwardAllocationResult[] = [];
  const unawarded: UnawardedLineResult[] = [];

  for (const line of lines) {
    const all = byLine.get(line.rfqLineId) ?? [];

    const candidates = all
      .filter((q) => (options.singleVendorId ? q.vendorId === options.singleVendorId : true))
      .filter((q) => !filterByEligibility || eligible.has(q.vendorId))
      .filter((q) => usable.has(q.confidence))
      .map((q) => ({ quote: q, rate: rateFor(q, options.includeFreight) }))
      .filter((c): c is { quote: ComparableQuote; rate: Rate } => c.rate !== null)
      .sort((a, b) => a.rate - b.rate);

    if (candidates.length === 0) {
      unawarded.push({
        rfqLineId: line.rfqLineId,
        skuCode: line.skuCode,
        reason: explainNoCandidate({
          all,
          eligible,
          filterByEligibility,
          usable,
          includeFreight: options.includeFreight,
        }),
      });
      continue;
    }

    const winner = candidates[0]!;
    const runnerUp = candidates[1];

    allocations.push({
      rfqLineId: line.rfqLineId,
      vendorId: winner.quote.vendorId,
      quantity: line.quantity,
      unitRateInr: winner.rate,
      lineValuePaise: extend(winner.rate, line.quantity),
      basis: options.includeFreight ? "LANDED" : "EX_FREIGHT",
      confidence: winner.quote.confidence,
      marginOverNextPaise: runnerUp
        ? extend(runnerUp.rate, line.quantity) - extend(winner.rate, line.quantity)
        : undefined,
    });
  }

  const totalPaise = sum(allocations.map((a) => a.lineValuePaise));
  const verifiedValue = sum(
    allocations.filter((a) => a.confidence === "VERIFIED").map((a) => a.lineValuePaise),
  );

  return {
    allocations,
    unawarded,
    totalPaise,
    complete: unawarded.length === 0,
    evidenceCoverage: totalPaise === 0 ? 0 : verifiedValue / totalPaise,
    inferredLineCount: allocations.filter((a) => a.confidence !== "VERIFIED").length,
  };
}

/** Says precisely why a line could not be awarded, in the buyer's terms. */
function explainNoCandidate(params: {
  all: ComparableQuote[];
  eligible: Set<UUID>;
  filterByEligibility: boolean;
  usable: Set<ComparableQuote["confidence"]>;
  includeFreight: boolean;
}): string {
  const { all, eligible, filterByEligibility, usable, includeFreight } = params;

  if (all.length === 0) return "No supplier quoted this line.";

  const fromEligible = all.filter((q) => !filterByEligibility || eligible.has(q.vendorId));
  if (fromEligible.length === 0) {
    return "Only suppliers excluded by the eligibility rules quoted this line.";
  }

  const comparable = fromEligible.filter((q) => usable.has(q.confidence));
  if (comparable.length === 0) {
    const states = [...new Set(fromEligible.map((q) => q.confidence))].join(", ");
    return `Every quote for this line is ${states.toLowerCase()} and cannot be used in an award.`;
  }

  if (includeFreight && comparable.every((q) => q.landedRateInr === null)) {
    return "Freight is unresolved for every supplier on this line, so landed cost cannot be compared.";
  }

  return "No comparable quote for this line.";
}

/**
 * One supplier for everything.
 *
 * A supplier missing even one line cannot take a complete single-vendor award,
 * and the result says so rather than quietly costing 29 of 30 lines.
 */
export function calculateSingleVendorAwards(params: {
  lines: AwardLine[];
  quotes: ComparableQuote[];
  vendorIds: UUID[];
  options: Omit<AwardOptions, "singleVendorId">;
}): Map<UUID, AwardResult> {
  const results = new Map<UUID, AwardResult>();
  for (const vendorId of params.vendorIds) {
    results.set(
      vendorId,
      calculateAward({
        lines: params.lines,
        quotes: params.quotes,
        options: { ...params.options, singleVendorId: vendorId },
      }),
    );
  }
  return results;
}
