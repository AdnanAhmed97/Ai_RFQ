import "server-only";
import path from "node:path";
import type { AIAttachment } from "@/lib/ai/provider";
import type { DocumentKind } from "@/types";
import { classifyByFilename, imageMediaType, STRATEGY_BY_KIND } from "./classify";
import { parseDocx, parseText, parseXlsx, readBase64, type ParsedDocument } from "./parse";

/**
 * Turns a stored document into something the model can read, once.
 *
 * The parsed form is cached on the document row, so a file is opened from disk
 * a single time no matter how many times the pipeline or the UI comes back to
 * it (spec §55).
 */

export interface IngestedDocument {
  documentId: string;
  filename: string;
  kind: DocumentKind;
  attachment: AIAttachment;
  /** Present for parsed formats; absent for PDFs and images read natively. */
  parsed?: ParsedDocument;
}

/** Where fixture documents live, relative to the repository root. */
export function fixturesRoot(): string {
  return path.resolve(process.cwd(), "fixtures");
}

export async function ingestDocument(params: {
  documentId: string;
  filename: string;
  storagePath: string;
  kind?: DocumentKind;
}): Promise<IngestedDocument> {
  const absolutePath = path.join(fixturesRoot(), params.storagePath);
  const classification = classifyByFilename(params.filename);
  const kind = params.kind ?? classification.kind;
  const strategy = STRATEGY_BY_KIND[kind];

  switch (strategy) {
    case "NATIVE_DOCUMENT": {
      // Claude reads PDFs directly, scanned ones included. Rasterising here
      // ourselves would throw away the text layer where one exists and add
      // nothing where it does not.
      return {
        documentId: params.documentId,
        filename: params.filename,
        kind,
        attachment: {
          kind: "pdf",
          filename: params.filename,
          base64: await readBase64(absolutePath),
        },
      };
    }

    case "NATIVE_IMAGE": {
      return {
        documentId: params.documentId,
        filename: params.filename,
        kind,
        attachment: {
          kind: "image",
          filename: params.filename,
          mediaType: imageMediaType(classification.mimeType),
          base64: await readBase64(absolutePath),
        },
      };
    }

    case "STRUCTURED_TEXT": {
      const parsed =
        kind === "XLSX"
          ? await parseXlsx(absolutePath)
          : kind === "DOCX"
            ? await parseDocx(absolutePath)
            : await parseText(absolutePath);

      return {
        documentId: params.documentId,
        filename: params.filename,
        kind,
        parsed,
        attachment: { kind: "text", filename: params.filename, text: parsed.text },
      };
    }
  }
}
