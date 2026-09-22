import type { UUID } from "@/types";
import { calculateAward, type AwardLine, type AwardResult, type ComparableQuote } from "./award";
import type { EligibilityResult } from "./eligibility";
import { canReceiveAward } from "./eligibility";
import type { Paise } from "./money";

/**
 * Scenario modelling.
 *
 * A scenario is a set of assumptions plus the award they produce. Every
 * assumption is recorded on the result, because the value of "what if freight
 * rises 5%" is entirely in knowing which 5% and on what basis.
 */

export const SCENARIO_KINDS = [
  "BASELINE",
  "SINGLE_VENDOR",
  "SPLIT",
  "EXCLUDE_VENDOR",
  "FREIGHT_SHIFT",
  "FX_SHIFT",
  "STRICT_ELIGIBILITY",
  "CUSTOM",
] as const;
export type ScenarioKind = (typeof SCENARIO_KINDS)[number];

export interface ScenarioInputs {
  freightAdjustmentPercent?: number;
  fxAdjustmentPercent?: number;
  excludedVendorIds?: UUID[];
  requiredQuestionIds?: UUID[];
  singleVendorId?: UUID;
  includeFreight?: boolean;
  /** Carry suppliers whose eligibility could not be determined. */
  allowUndetermined?: boolean;
}

export interface ScenarioResult {
  name: string;
  kind: ScenarioKind;
  inputs: ScenarioInputs;
  /** Each assumption in plain language, for the brief. */
  assumptions: string[];
  award: AwardResult;
  savingsVsBaselinePaise?: Paise;
  excludedVendors: { vendorId: UUID; reason: string }[];
}

export function describeAssumptions(params: {
  inputs: ScenarioInputs;
  fxNote: string;
  hasConvertedValues: boolean;
}): string[] {
  const { inputs } = params;
  const assumptions: string[] = [];

  assumptions.push(
    inputs.includeFreight === false
      ? "Compared ex-freight. Delivered cost will differ by each supplier's freight terms."
      : "Compared on landed cost. Lines whose freight could not be resolved are excluded.",
  );

  if (params.hasConvertedValues) assumptions.push(params.fxNote);
  if (inputs.freightAdjustmentPercent) {
    assumptions.push(
      `Freight adjusted ${inputs.freightAdjustmentPercent > 0 ? "+" : ""}${inputs.freightAdjustmentPercent}% against the quoted rates.`,
    );
  }
  if (inputs.fxAdjustmentPercent) {
    assumptions.push(
      `USD/INR moved ${inputs.fxAdjustmentPercent > 0 ? "+" : ""}${inputs.fxAdjustmentPercent}% against the prototype rate.`,
    );
  }
  if (inputs.excludedVendorIds?.length) {
    assumptions.push(`${inputs.excludedVendorIds.length} supplier(s) excluded by hand.`);
  }
  if (inputs.allowUndetermined) {
    assumptions.push(
      "Suppliers whose eligibility could not be determined were allowed to receive award.",
    );
  }

  return assumptions;
}

export function runScenario(params: {
  name: string;
  kind: ScenarioKind;
  inputs: ScenarioInputs;
  lines: AwardLine[];
  quotes: ComparableQuote[];
  eligibility: EligibilityResult[];
  assumptions: string[];
  baselineTotalPaise?: Paise;
}): ScenarioResult {
  const excludedByHand = new Set(params.inputs.excludedVendorIds ?? []);
  const excludedVendors: { vendorId: UUID; reason: string }[] = [];
  const eligibleVendorIds: UUID[] = [];

  for (const result of params.eligibility) {
    if (excludedByHand.has(result.vendorId)) {
      excludedVendors.push({ vendorId: result.vendorId, reason: "Excluded for this scenario." });
      continue;
    }
    if (!canReceiveAward(result, { allowUndetermined: params.inputs.allowUndetermined })) {
      excludedVendors.push({
        vendorId: result.vendorId,
        reason: result.reasons[0] ?? "Not eligible.",
      });
      continue;
    }
    eligibleVendorIds.push(result.vendorId);
  }

  const award = calculateAward({
    lines: params.lines,
    quotes: params.quotes,
    options: {
      eligibleVendorIds,
      includeFreight: params.inputs.includeFreight ?? true,
      singleVendorId: params.inputs.singleVendorId,
    },
  });

  return {
    name: params.name,
    kind: params.kind,
    inputs: params.inputs,
    assumptions: params.assumptions,
    award,
    // Only meaningful between two complete awards; a partial total compared
    // against a whole one is a saving that does not exist.
    savingsVsBaselinePaise:
      params.baselineTotalPaise !== undefined && award.complete
        ? params.baselineTotalPaise - award.totalPaise
        : undefined,
    excludedVendors,
  };
}
