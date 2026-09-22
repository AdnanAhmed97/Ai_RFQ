import type { AIOperationStatus, ConfidenceState, UUID } from "./common";
import type { QuestionType } from "./rfx";
import type { EvidenceReference } from "./evidence";

export interface Vendor {
  id: UUID;
  rfqId: UUID;
  name: string;
  /** Short label used in dense table headers, e.g. "Vendor C". */
  shortLabel: string;
  contactEmail?: string;
  country?: string;
}

/** One vendor's reply to one RFx. May span several documents of mixed formats. */
export interface VendorResponse {
  id: UUID;
  rfqId: UUID;
  vendorId: UUID;
  receivedAt: string;
  /** How the response arrived. Simulated in the prototype; no real SMTP (spec §17). */
  channel: "EMAIL" | "UPLOAD";
  status: AIOperationStatus;
  /** Set once processing finishes: how many RFx lines this vendor actually quoted. */
  quotedLineCount?: number;
  expectedLineCount?: number;
  notes?: string;
}

export interface QuestionnaireAnswer {
  id: UUID;
  vendorId: UUID;
  questionId: UUID;
  type: QuestionType;
  /** The answer as extracted, before interpretation. */
  rawAnswer?: string;
  /** Normalized answer used by the eligibility engine. */
  normalizedAnswer?: string | number | boolean | string[];
  /**
   * Whether this answer satisfies the question, when the question is
   * eligibility-bearing. Null when it cannot be determined.
   */
  passes: boolean | null;
  confidence: ConfidenceState;
  evidence: EvidenceReference[];
}

/** Outcome of the deterministic eligibility pass over questionnaire answers. */
export interface VendorEligibility {
  vendorId: UUID;
  eligible: boolean;
  /** Plain-language reasons, each traceable to a question and its evidence. */
  reasons: string[];
  failedMandatoryQuestionIds: UUID[];
  /** Questions whose answers could not be determined — blocks a clean verdict. */
  undeterminedQuestionIds: UUID[];
}
