import type { UUID } from "./common";
import type { Assumption } from "./rfx";
import type { CommercialIssue } from "./quote";

/** A single line's award, with the reason it went where it went. */
export interface AwardAllocation {
  rfqLineId: UUID;
  vendorId: UUID;
  quantity: number;
  /** Normalized unit price in INR used for this allocation. */
  unitPriceInr: number;
  lineValueInr: number;
  /** Freight attributable to this line, when it can be determined. */
  freightInr?: number;
  rationale?: string;
}

/** A line the optimizer refused to award, and why. Never silently dropped. */
export interface UnawardedLine {
  rfqLineId: UUID;
  reason: string;
  blockingIssueIds: UUID[];
}

export interface ScenarioInputs {
  /** e.g. +5 for "freight rises 5%". */
  freightAdjustmentPercent?: number;
  /** e.g. +3 for "USD/INR moves 3%". */
  fxAdjustmentPercent?: number;
  excludedVendorIds?: UUID[];
  /** Question IDs that must be passed for a vendor to remain eligible. */
  requiredQuestionnaireQuestionIds?: UUID[];
  /** Restrict the award to one vendor. */
  singleVendorId?: UUID;
  eligibleOnly?: boolean;
  includeFreight?: boolean;
}

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

/**
 * The output of one deterministic award calculation.
 *
 * `totalCostInr` is optional on purpose: when lines cannot be compared safely
 * the engine reports an incomplete optimization instead of a confident total
 * built on gaps (spec §38).
 */
export interface AwardScenario {
  id: UUID;
  rfqId: UUID;
  name: string;
  kind: ScenarioKind;
  inputs: ScenarioInputs;
  assumptions: Assumption[];

  totalCostInr?: number;
  savingsVsBaselineInr?: number;
  /** Share of award value backed by VERIFIED evidence, 0-1. */
  evidenceCoverage?: number;

  allocation: AwardAllocation[];
  unawardedLines: UnawardedLine[];
  unresolvedIssues: CommercialIssue[];

  /** False when any RFx line could not be awarded. */
  complete: boolean;
  computedAt: string;
}

/** Something that could materially change the recommendation (spec §41). */
export interface DecisionRisk {
  id: UUID;
  summary: string;
  /** Number of RFx lines affected. */
  affectedLineCount: number;
  /**
   * Rupee exposure, when it can be computed deterministically.
   * Absent means "we cannot size this safely" — which is itself the answer.
   */
  estimatedExposureInr?: number;
  relatedIssueIds: UUID[];
}

export interface DecisionBrief {
  id: UUID;
  rfqId: UUID;
  scenarioId: UUID;
  executiveSummary: string;
  risks: DecisionRisk[];
  generatedAt: string;
  approvedAt?: string;
  approvedBy?: UUID;
}

export const CHAT_ROLES = ["user", "assistant", "tool"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export interface ChatSession {
  id: UUID;
  rfqId: UUID;
  /** Which copilot this conversation belongs to. */
  surface: "RFX_COPILOT" | "DECISION_COPILOT";
  createdAt: string;
}

export interface ChatMessage {
  id: UUID;
  sessionId: UUID;
  role: ChatRole;
  content: string;
  /** Tool calls made on this turn, for the "view calculation" affordance. */
  toolCalls?: Array<{
    name: string;
    input: unknown;
    resultStatus: "OK" | "ERROR";
  }>;
  createdAt: string;
}
