import { z } from "zod";

/**
 * Decision Copilot tool contracts (spec §36).
 *
 * These are the only way the model can obtain a commercial figure. Each name,
 * description and input schema is fixed here; Slice 6 supplies the deterministic
 * implementations and Slice 7 binds them into the agent loop.
 *
 * Tool order is stable because the tool block is part of the cached prompt
 * prefix — reordering it silently costs every cache hit.
 */

export const ToolNames = {
  getRfxContext: "get_rfx_context",
  getVendorSummary: "get_vendor_summary",
  getCommercialTruth: "get_commercial_truth",
  getExceptions: "get_exceptions",
  getEvidence: "get_evidence",
  calculateSingleVendorAward: "calculate_single_vendor_award",
  calculateSplitAward: "calculate_split_award",
  calculateScenario: "calculate_scenario",
  compareScenarios: "compare_scenarios",
  generateAwardBrief: "generate_award_brief",
} as const;

export type ToolName = (typeof ToolNames)[keyof typeof ToolNames];

const rfqId = z.string().describe("The RFx being analysed");

export const GetRfxContextInput = z.object({ rfqId });

export const GetVendorSummaryInput = z.object({
  rfqId,
  vendorId: z.string().nullable().describe("null for every vendor on the RFx"),
});

export const GetCommercialTruthInput = z.object({
  rfqId,
  vendorIds: z.array(z.string()).nullable().describe("null for all vendors"),
  rfqLineIds: z.array(z.string()).nullable().describe("null for all lines"),
  comparableOnly: z
    .boolean()
    .describe("When true, omits records that could not be safely normalized"),
});

export const GetExceptionsInput = z.object({
  rfqId,
  includeResolved: z.boolean(),
});

export const GetEvidenceInput = z.object({
  subjectType: z.enum(["VENDOR_QUOTE", "QUESTIONNAIRE_ANSWER", "COMMERCIAL_ISSUE"]),
  subjectId: z.string(),
});

export const CalculateSingleVendorAwardInput = z.object({
  rfqId,
  eligibleOnly: z.boolean().describe("Exclude vendors failing a mandatory questionnaire rule"),
  vendorId: z.string().nullable().describe("null to evaluate every vendor"),
  includeFreight: z.boolean(),
});

export const CalculateSplitAwardInput = z.object({
  rfqId,
  eligibleOnly: z.boolean(),
  includeFreight: z.boolean(),
  excludedVendorIds: z.array(z.string()),
});

export const CalculateScenarioInput = z.object({
  rfqId,
  name: z.string(),
  freightAdjustmentPercent: z.number().nullable(),
  fxAdjustmentPercent: z.number().nullable(),
  excludedVendorIds: z.array(z.string()),
  requiredQuestionnaireQuestionIds: z.array(z.string()),
  singleVendorId: z.string().nullable().describe("null for a split award"),
  includeFreight: z.boolean(),
});

export const CompareScenariosInput = z.object({
  rfqId,
  scenarioIds: z.array(z.string()).min(2),
});

export const GenerateAwardBriefInput = z.object({
  rfqId,
  scenarioId: z.string(),
});

/**
 * Descriptions the model reads. Each states what the tool returns AND its
 * failure mode, because "this returns an incomplete result when lines cannot be
 * compared" is the part that keeps the model honest.
 */
export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  [ToolNames.getRfxContext]:
    "Returns the RFx: scope, line items with quantities and units, commercial terms, and the questionnaire including which questions are eligibility-bearing. Start here when a question depends on what was asked for.",
  [ToolNames.getVendorSummary]:
    "Returns each vendor's response status, how many of the RFx lines they quoted, their questionnaire outcome, and whether they are eligible for award with the reasons.",
  [ToolNames.getCommercialTruth]:
    "Returns normalized per-unit prices by vendor and line, each with its confidence state and the original quoted value. Records that could not be safely normalized are included with a null normalized value unless comparableOnly is set.",
  [ToolNames.getExceptions]:
    "Returns unresolved commercial issues — missing lines, unit and currency mismatches, unknown pack sizes, conflicting prices, freight ambiguity, questionnaire failures. Use this before presenting any recommendation as safe.",
  [ToolNames.getEvidence]:
    "Returns the source references behind one extracted value: document, page or sheet, row, and the text it was read from. Use this to cite a number.",
  [ToolNames.calculateSingleVendorAward]:
    "Computes the total cost of awarding every line to one vendor, for one vendor or all of them. A vendor missing a mandatory line cannot receive a complete single-vendor award, and the result says so rather than substituting zero.",
  [ToolNames.calculateSplitAward]:
    "Computes the cheapest line-by-line allocation across vendors. Lines that cannot be safely compared are returned as unawarded with reasons, and the total is reported as incomplete rather than pretending the whole award was solved.",
  [ToolNames.calculateScenario]:
    "Computes an award under adjusted assumptions — freight or FX moved by a percentage, vendors excluded, stricter eligibility. Returns the same allocation shape as the other award tools, plus the assumptions applied.",
  [ToolNames.compareScenarios]:
    "Compares two or more computed scenarios: cost difference, allocation changes, and which issues differ between them.",
  [ToolNames.generateAwardBrief]:
    "Produces the decision brief for a computed scenario: recommendation, allocation, eligibility outcome, open issues and evidence coverage.",
};

export const TOOL_INPUT_SCHEMAS = {
  [ToolNames.getRfxContext]: GetRfxContextInput,
  [ToolNames.getVendorSummary]: GetVendorSummaryInput,
  [ToolNames.getCommercialTruth]: GetCommercialTruthInput,
  [ToolNames.getExceptions]: GetExceptionsInput,
  [ToolNames.getEvidence]: GetEvidenceInput,
  [ToolNames.calculateSingleVendorAward]: CalculateSingleVendorAwardInput,
  [ToolNames.calculateSplitAward]: CalculateSplitAwardInput,
  [ToolNames.calculateScenario]: CalculateScenarioInput,
  [ToolNames.compareScenarios]: CompareScenariosInput,
  [ToolNames.generateAwardBrief]: GenerateAwardBriefInput,
} as const satisfies Record<ToolName, z.ZodType<unknown>>;

/** The order tools are presented in. Stable, for prompt-cache reasons. */
export const TOOL_ORDER: readonly ToolName[] = [
  ToolNames.getRfxContext,
  ToolNames.getVendorSummary,
  ToolNames.getCommercialTruth,
  ToolNames.getExceptions,
  ToolNames.getEvidence,
  ToolNames.calculateSingleVendorAward,
  ToolNames.calculateSplitAward,
  ToolNames.calculateScenario,
  ToolNames.compareScenarios,
  ToolNames.generateAwardBrief,
];

/**
 * Schema lookup with the input type erased.
 *
 * Indexing TOOL_INPUT_SCHEMAS with a `ToolName` union yields a union of schemas
 * that TypeScript cannot reconcile into one tool shape. The registry validates
 * against whichever schema this returns before invoking a tool body, so the
 * erasure costs nothing at runtime.
 */
export function toolInputSchema(name: ToolName): z.ZodType<unknown> {
  return TOOL_INPUT_SCHEMAS[name];
}
