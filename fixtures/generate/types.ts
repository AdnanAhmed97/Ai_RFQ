/**
 * Generators return where every value landed in the document they produced.
 *
 * Ground truth is then derived from these records rather than hand-written, so
 * a source location can never drift out of sync with the file it points at.
 */
export interface EvidenceRecord {
  /** RFx SKU this value relates to. Absent for document-level facts. */
  skuCode?: string;
  /** What the value is: "quoted_price", "freight", "questionnaire:Q4", ... */
  field: string;
  sheet?: string;
  page?: number;
  row?: number;
  column?: string;
  /** The literal text as it appears in the document. */
  sourceText: string;
}

export interface GeneratedDocument {
  /** Path relative to the fixtures root. */
  relativePath: string;
  mimeType: string;
  kind: "XLSX" | "PDF" | "DOCX" | "IMAGE" | "TEXT";
  evidence: EvidenceRecord[];
}
