import { z } from "zod";
import {
  CONFIDENCE_STATES,
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  MATCH_STATUSES,
  QUESTION_TYPES,
  SUPPORTED_CURRENCIES,
} from "@/types";

/**
 * Zod schemas the model is constrained to (spec §48).
 *
 * The governing rule throughout: a value the source does not state is `null`
 * with an explicit status — never zero, never a plausible default. Every
 * nullable field below exists so the model has somewhere honest to put "I
 * could not find this".
 */

export const ConfidenceStateSchema = z.enum(CONFIDENCE_STATES);
export const CurrencySchema = z.enum(SUPPORTED_CURRENCIES);

export const EvidenceRefSchema = z.object({
  page: z.number().int().positive().nullable().describe("1-indexed page, for PDFs and images"),
  sheet: z.string().nullable().describe("Sheet name, for spreadsheets"),
  row: z.number().int().positive().nullable().describe("1-indexed row"),
  column: z.string().nullable().describe("Column letter or header label"),
  sourceText: z
    .string()
    .nullable()
    .describe("The literal text this value was read from, copied verbatim"),
});

export const ExtractionIssueSchema = z.object({
  category: z.enum(ISSUE_CATEGORIES),
  severity: z.enum(ISSUE_SEVERITIES),
  summary: z.string().describe("One sentence a buyer can act on"),
  detail: z.string().nullable(),
});

export const FreightSchema = z.object({
  status: z
    .enum(["INCLUDED", "EXTRA", "UNKNOWN"])
    .describe("UNKNOWN unless the document states the freight treatment"),
  amount: z.number().nullable(),
  currency: CurrencySchema.nullable(),
  basis: z.string().nullable().describe("e.g. 'per shipment', 'per tonne'"),
});

/** One commercial line as read out of a vendor document. */
export const ExtractedQuoteSchema = z.object({
  rawDescription: z
    .string()
    .nullable()
    .describe("The vendor's own wording for this item, verbatim"),
  quotedPrice: z.number().nullable().describe("null if the document states no price"),
  currency: CurrencySchema.nullable(),
  quotedUnit: z
    .string()
    .nullable()
    .describe("The pricing unit exactly as written, e.g. 'per 100 pieces', 'per box'"),
  quantityBasis: z
    .number()
    .nullable()
    .describe("Units per quoted unit, only if the document states it. null for an unknown pack size"),
  quantityBasisUnit: z.string().nullable(),
  freight: FreightSchema,
  taxesIncluded: z.boolean().nullable(),
  taxRate: z.number().nullable(),
  leadTimeDays: z.number().int().nullable(),
  moq: z.number().nullable(),
  confidence: ConfidenceStateSchema,
  /**
   * Where this value was read from. Exactly one reference, required.
   *
   * An array allowed for several sources per value, which in practice never
   * happened — a price sits in one cell — and nesting an array of objects
   * inside an array of objects is the dominant cost in the compiled grammar.
   * Contradictions between documents are captured as a CONFLICT confidence
   * plus a concern, not as two evidence entries.
   */
  evidence: EvidenceRefSchema,
  /**
   * A free-text note on anything wrong or ambiguous about this line.
   *
   * Deliberately not a categorised issue: which category a problem falls into
   * is decided by deterministic validation from the extracted values, so asking
   * the model to classify it as well was both redundant and the main source of
   * schema complexity.
   */
  concern: z
    .string()
    .nullable()
    .describe("Anything ambiguous, contradictory or unreadable about this line"),
});

export const ExtractedQuestionnaireAnswerSchema = z.object({
  questionRef: z
    .string()
    .describe('The question reference as printed in the document, e.g. "Q4"'),
  rawAnswer: z.string().nullable(),
  confidence: ConfidenceStateSchema,
  evidence: EvidenceRefSchema,
});

/** Top-level result of one document extraction pass. */
export const DocumentExtractionSchema = z.object({
  documentSummary: z.string().describe("One or two sentences on what this document is"),
  quotes: z.array(ExtractedQuoteSchema),
  questionnaireAnswers: z.array(ExtractedQuestionnaireAnswerSchema),
  issues: z.array(ExtractionIssueSchema).describe("Document-level problems"),
});
export type DocumentExtraction = z.infer<typeof DocumentExtractionSchema>;

/** Mapping a vendor's line onto an RFx line (spec §24). */
export const LineMatchSchema = z.object({
  vendorLineIndex: z.number().int().min(0),
  status: z.enum(MATCH_STATUSES),
  rfqLineId: z.string().nullable().describe("null unless status is MATCHED"),
  score: z.number().min(0).max(1).nullable(),
  reasoning: z.string().describe("Why these describe the same item, or why not"),
  candidates: z
    .array(z.object({ rfqLineId: z.string(), score: z.number().min(0).max(1), reasoning: z.string() }))
    .describe("Ranked alternatives. Required when status is REVIEW_REQUIRED"),
});

export const LineMatchBatchSchema = z.object({
  matches: z.array(LineMatchSchema),
});
export type LineMatchBatch = z.infer<typeof LineMatchBatchSchema>;

/**
 * A verdict on one questionnaire answer.
 *
 * The model reads the language; deterministic code decides eligibility from
 * these verdicts. `passes: null` is a first-class outcome — an answer that is
 * neither a yes nor a no must survive as undetermined rather than being forced
 * into one.
 */
export const AnswerVerdictSchema = z.object({
  questionRef: z.string().describe('The question reference, e.g. "Q4"'),
  passes: z
    .boolean()
    .nullable()
    .describe(
      "true if the answer satisfies the requirement, false if it does not, " +
        "null if the answer is genuinely neither. Do not force a null into a yes or a no.",
    ),
  reasoning: z
    .string()
    .describe("One sentence a buyer could quote when defending the decision"),
  quotedAnswer: z
    .string()
    .nullable()
    .describe("The part of the supplier's answer the verdict turns on, verbatim"),
});

export const EligibilityReviewSchema = z.object({
  verdicts: z.array(AnswerVerdictSchema),
});
export type EligibilityReview = z.infer<typeof EligibilityReviewSchema>;

// --- RFx copilot -----------------------------------------------------------

export const DraftLineItemSchema = z.object({
  skuCode: z.string(),
  description: z.string(),
  specifications: z.record(z.string(), z.string()),
  quantity: z.number().positive(),
  unit: z.string(),
  notes: z.string().nullable(),
});

export const DraftQuestionSchema = z.object({
  question: z.string(),
  type: z.enum(QUESTION_TYPES),
  required: z.boolean(),
  mandatoryForEligibility: z
    .boolean()
    .describe("True only when a failing answer should disqualify a vendor"),
  options: z.array(z.string()).nullable(),
});

export const DraftAssumptionSchema = z.object({
  statement: z.string(),
  origin: z.enum(["BUYER", "AI_SUGGESTED", "SYSTEM_DEFAULT"]),
  rationale: z.string().nullable(),
});

export const RFxDraftSchema = z.object({
  title: z.string(),
  category: z.string(),
  objective: z.string(),
  scope: z.string(),
  geography: z.string().nullable(),
  lineItems: z.array(DraftLineItemSchema),
  questionnaire: z.array(DraftQuestionSchema),
  commercialTerms: z.object({
    currency: CurrencySchema,
    pricingBasis: z.string(),
    paymentTermsDays: z.number().int().nullable(),
    deliveryTerms: z.string().nullable(),
    freightExpectation: z.enum(["INCLUDED", "EXTRA", "VENDOR_TO_STATE"]).nullable(),
    quoteValidityDays: z.number().int().nullable(),
    incoterms: z.string().nullable(),
  }),
  evaluationCriteria: z.array(
    z.object({ label: z.string(), weight: z.number().min(0).max(100), description: z.string().nullable() }),
  ),
  assumptions: z.array(DraftAssumptionSchema),
  unresolvedQuestions: z.array(
    z.object({ question: z.string(), suggestedAnswers: z.array(z.string()) }),
  ),
});
export type RFxDraftOutput = z.infer<typeof RFxDraftSchema>;

/** One copilot turn: either more questions, or a signal that it can draft. */
export const CopilotTurnSchema = z.object({
  reply: z.string().describe("What the buyer sees. Conversational, never a form"),
  state: z.enum(["DISCOVERY", "CLARIFYING", "DRAFTING", "REVIEW"]),
  /** Only questions whose answers would change the RFx. */
  clarifications: z.array(
    z.object({
      question: z.string(),
      suggestedAnswers: z.array(z.string()).describe("Chips. The buyer may ignore them"),
    }),
  ),
  contextUpdates: z.object({
    category: z.string().nullable(),
    geography: z.string().nullable(),
    expectedVendorCount: z.number().int().nullable(),
    pricingBasis: z.string().nullable(),
    currency: CurrencySchema.nullable(),
    deliveryTerms: z.string().nullable(),
    paymentTerms: z.string().nullable(),
    quoteValidity: z.string().nullable(),
    lineItemCountTarget: z.number().int().nullable(),
  }),
  readyToDraft: z.boolean(),
});
export type CopilotTurn = z.infer<typeof CopilotTurnSchema>;
