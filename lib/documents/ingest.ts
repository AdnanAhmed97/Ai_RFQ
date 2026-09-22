import "server-only";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AIAttachment } from "@/lib/ai/provider";
import type { DocumentKind } from "@/types";
import { readDocument, fixturesRoot } from "@/lib/storage/documents";
import { classifyByFilename, imageMediaType, STRATEGY_BY_KIND } from "./classify";
import { parseDocx, parseText, parseXlsx, type ParsedDocument } from "./parse";

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

export { fixturesRoot };

export async function ingestDocument(params: {
  documentId: string;
  filename: string;
  storagePath: string;
  kind?: DocumentKind;
}): Promise<IngestedDocument> {
  // One read, whichever backend holds the file.
  const bytes = await readDocument(params.storagePath);
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
          base64: bytes.toString("base64"),
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
          base64: bytes.toString("base64"),
        },
      };
    }

    case "STRUCTURED_TEXT": {
      // The spreadsheet and Word parsers read from a path, so bytes fetched
      // from object storage are staged to a temporary file first.
      const staged = path.join(
        await mkdtemp(path.join(tmpdir(), "rfx-")),
        path.basename(params.filename),
      );
      await writeFile(staged, bytes);
      const parsed =
        kind === "XLSX"
          ? await parseXlsx(staged)
          : kind === "DOCX"
            ? await parseDocx(staged)
            : await parseText(staged);

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
