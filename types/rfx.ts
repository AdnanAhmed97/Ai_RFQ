import type { CurrencyCode, ISODateString, UUID } from "./common";

/** Where an RFx sits in its lifecycle. Drives the stage navigation. */
export const RFX_STATUSES = [
  "DRAFT",
  "SENT",
  "RESPONSES",
  "ANALYSIS",
  "DECISION",
  "AWARDED",
] as const;
export type RFxStatus = (typeof RFX_STATUSES)[number];

/** Copilot conversation state (spec §14). Prevents redundant questions. */
export const RFX_CREATION_STATES = [
  "DISCOVERY",
  "CLARIFYING",
  "DRAFTING",
  "REVIEW",
  "APPROVED",
] as const;
export type RFxCreationState = (typeof RFX_CREATION_STATES)[number];

export const QUESTION_TYPES = [
  "yes_no",
  "text",
  "number",
  "single_select",
  "multi_select",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface LineItem {
  id: UUID;
  rfqId: UUID;
  /** Display order, 1-indexed. Stable across edits so "Line 014" means one thing. */
  position: number;
  skuCode: string;
  description: string;
  specifications: Record<string, string>;
  quantity: number;
  unit: string;
  currency?: CurrencyCode;
  requiredBy?: ISODateString;
  notes?: string;
}

export interface QuestionnaireQuestion {
  id: UUID;
  rfqId: UUID;
  position: number;
  question: string;
  type: QuestionType;
  required: boolean;
  /**
   * When true, a failing answer makes the vendor ineligible for award.
   * The AI may explain this rule; only deterministic code enforces it (spec §34).
   */
  mandatoryForEligibility: boolean;
  options?: string[];
}

export interface CommercialTerms {
  currency: CurrencyCode;
  /** e.g. "per piece" — the basis vendors are asked to quote on. */
  pricingBasis: string;
  paymentTermsDays?: number;
  deliveryTerms?: string;
  freightExpectation?: "INCLUDED" | "EXTRA" | "VENDOR_TO_STATE";
  quoteValidityDays?: number;
  incoterms?: string;
  notes?: string;
}

export interface EvaluationCriterion {
  id: UUID;
  label: string;
  /** 0-100. Weights across criteria are validated to sum to 100. */
  weight: number;
  description?: string;
}

/**
 * Something the system is proceeding on but cannot prove. Surfaced to the
 * buyer rather than absorbed silently.
 */
export interface Assumption {
  id: UUID;
  statement: string;
  /** Who introduced it — matters for trust. */
  origin: "BUYER" | "AI_SUGGESTED" | "SYSTEM_DEFAULT";
  accepted: boolean;
  rationale?: string;
}

/** An open question the copilot wants answered before it stops guessing. */
export interface Clarification {
  id: UUID;
  question: string;
  /** Chip suggestions rendered in the copilot UI. The buyer may ignore them. */
  suggestedAnswers?: string[];
  answer?: string;
  answeredAt?: string;
}

export interface RFx {
  id: UUID;
  ownerId: UUID;
  title: string;
  category: string;
  objective: string;
  scope: string;
  geography?: string;
  status: RFxStatus;
  creationState: RFxCreationState;
  commercialTerms: CommercialTerms;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
}

/** The full aggregate the draft screen and the AI both work against. */
export interface RFxDraft {
  rfx: RFx;
  lineItems: LineItem[];
  questionnaire: QuestionnaireQuestion[];
  evaluationCriteria: EvaluationCriterion[];
  assumptions: Assumption[];
  unresolvedQuestions: Clarification[];
}

/** Everything the copilot has learned so far. Persisted between turns (spec §14). */
export interface RFxContext {
  category?: string;
  geography?: string;
  expectedVendorCount?: number;
  pricingBasis?: string;
  currency?: CurrencyCode;
  deliveryTerms?: string;
  paymentTerms?: string;
  quoteValidity?: string;
  lineItemCountTarget?: number;
  notes?: string[];
}
