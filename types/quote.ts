import type { ConfidenceState, CurrencyCode, UUID } from "./common";
import type { EvidenceReference } from "./evidence";

/** Freight is modelled separately and never assumed (spec §27). */
export interface Freight {
  status: "INCLUDED" | "EXTRA" | "UNKNOWN";
  amount?: number;
  currency?: CurrencyCode;
  /** e.g. "per shipment", "per tonne" — needed before freight can be allocated. */
  basis?: string;
}

export interface Taxes {
  included: boolean | null;
  /** Percentage, e.g. 18 for 18% GST. */
  rate?: number;
}

export const ISSUE_CATEGORIES = [
  "MISSING_LINE",
  "UNIT_MISMATCH",
  "CURRENCY_MISMATCH",
  "MISSING_PACK_SIZE",
  "CONFLICTING_PRICE",
  "FREIGHT_AMBIGUITY",
  "QUESTIONNAIRE_FAILURE",
  "LOW_EXTRACTION_CONFIDENCE",
  "UNMATCHED_LINE",
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const ISSUE_SEVERITIES = ["BLOCKER", "WARNING", "INFO"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

/**
 * A named problem with a vendor's commercial data. These drive the Exception
 * Center and are the reason a line can be excluded from an award calculation.
 */
export interface CommercialIssue {
  id: UUID;
  rfqId: UUID;
  vendorId: UUID;
  rfqLineId?: UUID;
  category: IssueCategory;
  severity: IssueSeverity;
  /** One sentence the buyer can act on. */
  summary: string;
  detail?: string;
  evidence: EvidenceReference[];
  resolvedAt?: string;
  resolutionNote?: string;
}

/** How a vendor's line description was mapped onto an RFx line (spec §24). */
export const MATCH_STATUSES = ["MATCHED", "REVIEW_REQUIRED", "UNMATCHED"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export interface LineMatch {
  status: MatchStatus;
  /** 0-1. Meaningful only as a ranking signal between candidates. */
  score?: number;
  reasoning?: string;
  /** Populated when the match is ambiguous; the buyer chooses. */
  candidates?: Array<{ rfqLineId: UUID; score: number; reasoning?: string }>;
}

/**
 * One commercial value as the model read it out of a document (spec §22).
 * This is the raw layer: nothing here has been converted or compared.
 */
export interface ExtractedQuote {
  id: UUID;
  vendorId: UUID;
  sourceDocumentId: UUID;
  extractionRunId: UUID;

  /** The vendor's own wording for the item, preserved verbatim. */
  rawDescription?: string;

  rfqLineId?: UUID;
  match: LineMatch;

  quotedPrice?: number;
  currency?: CurrencyCode;
  /** The unit exactly as quoted, e.g. "per 100 pieces", "per box". */
  quotedUnit?: string;

  /** How many base units one quoted unit contains, when the document says so. */
  quantityBasis?: number;
  quantityBasisUnit?: string;

  freight: Freight;
  taxes: Taxes;

  leadTimeDays?: number;
  moq?: number;

  confidence: ConfidenceState;
  evidence: EvidenceReference[];
  issues: CommercialIssue[];
}

/**
 * The canonical comparable record (spec §28): one vendor, one RFx line.
 *
 * `normalizedValue` is absent whenever normalization was not safe — a missing
 * pack size blocks it rather than producing a plausible-looking number.
 */
export interface CommercialTruthRecord {
  id: UUID;
  rfqId: UUID;
  rfqLineId: UUID;
  vendorId: UUID;

  quotedValue: {
    amount: number;
    currency: CurrencyCode;
    unit: string;
  };

  normalizedValue?: {
    /** Price per one base unit of the RFx line. */
    amount: number;
    currency: CurrencyCode;
    unit: string;
  };

  /** Plain-language record of the arithmetic, e.g. "₹4,200 ÷ 100 = ₹42". */
  derivation?: string;

  freight: Freight;
  taxes: Taxes;

  eligibility: {
    eligible: boolean;
    reasons: string[];
  };

  confidence: ConfidenceState;
  issues: CommercialIssue[];
  evidence: EvidenceReference[];
}
