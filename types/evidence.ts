import type { ConfidenceState, UUID } from "./common";

/**
 * Provenance for one extracted value (spec §23).
 *
 * Captured at extraction time, not reconstructed later. Without this a number
 * on the screen is an assertion, and the product's whole claim is that it is
 * not asking the buyer to trust assertions.
 */
export interface EvidenceReference {
  id: UUID;
  documentId: UUID;
  documentName: string;

  /** 1-indexed, for PDFs and images. */
  page?: number;
  /** Sheet name, for spreadsheets. */
  sheet?: string;
  /** 1-indexed row, for spreadsheets and tables. */
  row?: number;
  /** Column letter or header, for spreadsheets and tables. */
  column?: string;

  /** The literal text the value was read from. Preserved verbatim. */
  sourceText?: string;

  /** Normalized 0-1 bounding box, for image and scanned-PDF regions. */
  sourceRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export const DOCUMENT_KINDS = ["XLSX", "PDF", "DOCX", "IMAGE", "TEXT"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface SourceDocument {
  id: UUID;
  vendorResponseId: UUID;
  filename: string;
  kind: DocumentKind;
  mimeType: string;
  byteSize: number;
  /** Path within the storage bucket, or a repo-relative fixture path. */
  storagePath: string;
  /** Number of pages / sheets, once the document has been read. */
  partCount?: number;
  uploadedAt: string;
}

/**
 * The record of one AI pass over one document. Extraction happens once and is
 * persisted (spec §55); this row is what makes that auditable and re-runnable.
 */
export interface ExtractionRun {
  id: UUID;
  documentId: UUID;
  model: string;
  promptVersion: string;
  status: import("./common").AIOperationStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Operator-facing failure reason. Never contains document contents or keys. */
  error?: string;
}

/** A value plus the reason we believe it. Used wherever a number reaches the UI. */
export interface EvidencedValue<T> {
  value: T;
  confidence: ConfidenceState;
  evidence: EvidenceReference[];
  /** Human-readable account of any transformation applied, e.g. "₹4,200 ÷ 100". */
  derivation?: string;
}
