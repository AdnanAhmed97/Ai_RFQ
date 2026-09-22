import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { VENDOR_KEYS, type VendorKey } from "../vendors/profiles";
import { generateVendorAQuotation, generateVendorCQuotation } from "./excel";
import {
  generateQuestionnairePdf,
  generateVendorATerms,
  generateVendorBQuotation,
} from "./pdf";
import { generateVendorBQuestionnaire } from "./docx";
import { generateVendorCEmail } from "./email";
import { generateVendorDScannedQuotation } from "./scanned";
import { generateVendorEPhotoRateCard } from "./photo";
import type { GeneratedDocument } from "./types";

/** The document set each vendor sent, and in which formats. */
export const EXPECTED_DOCUMENTS: Record<VendorKey, string[]> = {
  "vendor-a": [
    "vendors/vendor-a/quotation.xlsx",
    "vendors/vendor-a/questionnaire.pdf",
    "vendors/vendor-a/terms.pdf",
  ],
  "vendor-b": ["vendors/vendor-b/quotation.pdf", "vendors/vendor-b/questionnaire.docx"],
  "vendor-c": [
    "vendors/vendor-c/quotation.xlsx",
    "vendors/vendor-c/commercial-email.txt",
    "vendors/vendor-c/questionnaire.pdf",
  ],
  "vendor-d": [
    "vendors/vendor-d/scanned-quotation.pdf",
    "vendors/vendor-d/questionnaire.pdf",
  ],
  "vendor-e": [
    "vendors/vendor-e/photographed-rate-card.jpg",
    "vendors/vendor-e/questionnaire.pdf",
  ],
};

export interface FixtureManifest {
  generatedAt: string;
  documents: (GeneratedDocument & { vendorKey: VendorKey })[];
}

/**
 * Produces every vendor document.
 *
 * Deterministic: prices come from a seeded hash, image noise from a seeded
 * PRNG, and no generator reads the clock for content. Re-running overwrites the
 * same files with identical content, so a regenerate is safe at any time.
 */
export async function generateAllFixtures(root: string): Promise<FixtureManifest> {
  for (const key of VENDOR_KEYS) {
    await mkdir(path.join(root, "vendors", key), { recursive: true });
  }

  const documents: (GeneratedDocument & { vendorKey: VendorKey })[] = [];
  const add = (vendorKey: VendorKey, doc: GeneratedDocument) =>
    documents.push({ ...doc, vendorKey });

  add("vendor-a", await generateVendorAQuotation(root));
  add("vendor-a", await generateQuestionnairePdf(root, "vendor-a"));
  add("vendor-a", await generateVendorATerms(root));

  add("vendor-b", await generateVendorBQuotation(root));
  add("vendor-b", await generateVendorBQuestionnaire(root));

  add("vendor-c", await generateVendorCQuotation(root));
  add("vendor-c", await generateVendorCEmail(root));
  add("vendor-c", await generateQuestionnairePdf(root, "vendor-c"));

  add("vendor-d", await generateVendorDScannedQuotation(root));
  add("vendor-d", await generateQuestionnairePdf(root, "vendor-d"));

  add("vendor-e", await generateVendorEPhotoRateCard(root));
  add("vendor-e", await generateQuestionnairePdf(root, "vendor-e"));

  const manifest: FixtureManifest = {
    // Fixed, not Date.now() — the manifest must be byte-stable across runs.
    generatedAt: "2026-03-22T00:00:00.000Z",
    documents,
  };

  await writeFile(
    path.join(root, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return manifest;
}
