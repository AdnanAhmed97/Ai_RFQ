import type { DocumentKind } from "@/types";

/**
 * How a document should be handed to the model.
 *
 * PDFs and images go to the model as-is: Claude reads both natively, including
 * scanned pages, so rendering a PDF to images ourselves would only lose
 * fidelity. Spreadsheets and Word documents are parsed to a structured text
 * form first, because their cell and paragraph coordinates are what evidence
 * references point at — and those coordinates do not survive a screenshot.
 */
export type IngestionStrategy = "NATIVE_DOCUMENT" | "NATIVE_IMAGE" | "STRUCTURED_TEXT";

const BY_EXTENSION: Record<string, { kind: DocumentKind; mimeType: string }> = {
  ".xlsx": {
    kind: "XLSX",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  ".xls": { kind: "XLSX", mimeType: "application/vnd.ms-excel" },
  ".pdf": { kind: "PDF", mimeType: "application/pdf" },
  ".docx": {
    kind: "DOCX",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  ".jpg": { kind: "IMAGE", mimeType: "image/jpeg" },
  ".jpeg": { kind: "IMAGE", mimeType: "image/jpeg" },
  ".png": { kind: "IMAGE", mimeType: "image/png" },
  ".txt": { kind: "TEXT", mimeType: "text/plain" },
  ".eml": { kind: "TEXT", mimeType: "text/plain" },
  ".csv": { kind: "TEXT", mimeType: "text/plain" },
};

export const STRATEGY_BY_KIND: Record<DocumentKind, IngestionStrategy> = {
  PDF: "NATIVE_DOCUMENT",
  IMAGE: "NATIVE_IMAGE",
  XLSX: "STRUCTURED_TEXT",
  DOCX: "STRUCTURED_TEXT",
  TEXT: "STRUCTURED_TEXT",
};

export class UnsupportedDocumentError extends Error {
  constructor(readonly filename: string) {
    super(`No ingestion strategy for ${filename}.`);
    this.name = "UnsupportedDocumentError";
  }
}

export function classifyByFilename(filename: string): {
  kind: DocumentKind;
  mimeType: string;
  strategy: IngestionStrategy;
} {
  const dot = filename.lastIndexOf(".");
  const extension = dot === -1 ? "" : filename.slice(dot).toLowerCase();
  const descriptor = BY_EXTENSION[extension];
  if (!descriptor) throw new UnsupportedDocumentError(filename);
  return { ...descriptor, strategy: STRATEGY_BY_KIND[descriptor.kind] };
}

/** Image media types the Messages API accepts. */
export function imageMediaType(mimeType: string): "image/jpeg" | "image/png" {
  return mimeType === "image/png" ? "image/png" : "image/jpeg";
}
