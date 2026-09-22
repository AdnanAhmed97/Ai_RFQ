/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DEVELOPER-ONLY GROUND TRUTH — NEVER REACHABLE FROM THE RUNNING PRODUCT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The intended factual reading of every fixture document: what each value
 * really is, where it sits, which RFx line it belongs to, and what the
 * normalization engine should conclude about it.
 *
 * This exists so Slices 4-6 can be measured. It is the answer key.
 *
 * It must never be imported by anything under app/, lib/ or components/. A
 * test asserts that (tests/ground-truth-isolation.test.ts); if the product
 * could read this file, every extraction and award result would be unfalsifiable
 * and the prototype's central claim would be worthless.
 *
 * Everything below is DERIVED from the same source data the generators use, so
 * the answer key cannot drift away from the documents it describes.
 */

import { LINE_ITEMS } from "../rfx/corrugated-fy27";
import { QUESTIONNAIRE } from "../rfx/questionnaire";
import { VENDOR_KEYS, VENDOR_PROFILES, type VendorKey } from "../vendors/profiles";
import {
  VENDOR_C_FREIGHT_PER_PIECE,
  VENDOR_C_REVISED_SKUS,
  VENDOR_E_HANDWRITTEN_SKU,
  VENDOR_E_QUOTE_FX,
  buildVendorLines,
  unitPriceInr,
  vendorCRevisedPrice,
  vendorEHandwrittenPrice,
} from "../vendors/quote-data";
import { QUESTIONNAIRE_ANSWERS } from "../vendors/questionnaire-answers";
import { FADED_RATE_SKUS } from "../generate/scanned";

/** The FX rate the prototype normalizes at. Matches FX_USD_INR in the env. */
export const GROUND_TRUTH_FX_USD_INR = 84.5;

export type NormalizationStatus =
  | "VERIFIED"
  | "INFERRED"
  | "REVIEW_REQUIRED"
  | "BLOCKED"
  | "CONFLICT";

export interface GroundTruthQuote {
  vendorKey: VendorKey;
  /** RFx line this quote belongs to. The mapping a matcher must recover. */
  skuCode: string;
  /** The fixture file this value appears in. */
  documentPath: string;
  sourceLocation: { sheet?: string; page?: number; row?: number; column?: string };
  /** The vendor's own wording, which is what a matcher actually sees. */
  vendorDescription: string;

  /** The number printed on the document. */
  quotedValue: number;
  currency: "INR" | "USD";
  /** The basis as printed, e.g. "per bundle". */
  quotedUnit: string;
  /** Units per quoted unit where the document states it; null where it does not. */
  packSize: number | null;

  /**
   * Price per one RFx unit in INR, once normalized.
   * Null means normalization is not safely possible — which is itself the
   * correct outcome, not a gap in this dataset.
   */
  expectedNormalizedInr: number | null;
  expectedNormalizationStatus: NormalizationStatus;

  /** What makes this line hard. Null when it is straightforward. */
  knownAmbiguity: string | null;
}

export interface GroundTruthFreight {
  vendorKey: VendorKey;
  documentPath: string;
  expectedStatus: "INCLUDED" | "EXTRA" | "UNKNOWN";
  /** Per-piece freight in INR where the vendor stated a figure. */
  expectedAmountInr: number | null;
  sourceText: string;
  knownAmbiguity: string | null;
}

export interface GroundTruthQuestionnaireAnswer {
  vendorKey: VendorKey;
  ref: string;
  documentPath: string;
  answerText: string;
  mandatoryForEligibility: boolean;
  /**
   * Whether this answer satisfies the question.
   * `null` means genuinely undeterminable from the document — distinct from
   * false, and the distinction matters for eligibility.
   */
  expectedPasses: boolean | null;
  knownAmbiguity: string | null;
}

export interface GroundTruthMissingLine {
  vendorKey: VendorKey;
  skuCode: string;
  reason: string;
}

// --- Per-vendor normalization expectations ---------------------------------

const B_UNSTATED_BUNDLE = ["CP-3M-006", "CP-3M-007", "CP-TRY-026"];

function quoteExpectation(
  vendorKey: VendorKey,
  skuCode: string,
  packSize: number | null,
  quotedUnit: string,
  quotedValue: number,
  currency: "INR" | "USD",
): { normalized: number | null; status: NormalizationStatus; ambiguity: string | null } {
  const round = (n: number) => Math.round(n * 1000000) / 1000000;

  // Vendor B: priced per bundle with no bundle quantity anywhere in the file.
  if (vendorKey === "vendor-b" && B_UNSTATED_BUNDLE.includes(skuCode)) {
    return {
      normalized: null,
      status: "BLOCKED",
      ambiguity:
        "Quoted per bundle. The bundle quantity is not stated anywhere in the document, so a per-piece rate cannot be derived without inventing the pack size.",
    };
  }

  // Vendor C: the spreadsheet rate is contradicted by the later email.
  if (vendorKey === "vendor-c" && VENDOR_C_REVISED_SKUS.includes(skuCode)) {
    return {
      normalized: round(vendorCRevisedPrice(skuCode)!),
      status: "CONFLICT",
      ambiguity: `The spreadsheet states ${quotedValue.toFixed(2)} and the follow-up email revises it to ${vendorCRevisedPrice(skuCode)!.toFixed(2)}. The spreadsheet was never reissued, so both documents stand.`,
    };
  }

  // Vendor D: the rate was printed with faded toner and scanned.
  if (vendorKey === "vendor-d" && FADED_RATE_SKUS.includes(skuCode)) {
    return {
      normalized: round(quotedValue),
      status: "REVIEW_REQUIRED",
      ambiguity:
        "Printed with faded toner and degraded by the scan. Individual digits are genuinely ambiguous and the reading should be confirmed against the vendor before use.",
    };
  }

  // Vendor E: a printed rate struck through and replaced in pen.
  if (vendorKey === "vendor-e" && skuCode === VENDOR_E_HANDWRITTEN_SKU) {
    return {
      normalized: round(vendorEHandwrittenPrice()),
      status: "CONFLICT",
      ambiguity: `The printed rate ${quotedValue.toFixed(2)} is struck through and ${vendorEHandwrittenPrice().toFixed(2)} written beside it in pen. The annotation is unsigned and undated.`,
    };
  }

  // Vendor E: priced in dollars. Conversion depends on a rate the document
  // does not fix, so the result is an interpretation rather than a fact.
  if (currency === "USD") {
    return {
      normalized: round(quotedValue * GROUND_TRUTH_FX_USD_INR),
      status: "INFERRED",
      ambiguity: `Quoted in USD. The card says conversion is "at prevailing rate on date of invoice", so any INR figure depends on an assumed rate (prototype anchor ${GROUND_TRUTH_FX_USD_INR}).`,
    };
  }

  // Priced per bundle or per 100, with the quantity stated. Exact arithmetic.
  if (packSize && packSize > 1) {
    return {
      normalized: round(quotedValue / packSize),
      status: "VERIFIED",
      ambiguity: `Quoted ${quotedUnit}; the document states the quantity, so the per-unit rate follows by division.`,
    };
  }

  return { normalized: round(quotedValue), status: "VERIFIED", ambiguity: null };
}

// --- Document paths per vendor ----------------------------------------------

const QUOTE_DOCUMENT: Record<VendorKey, string> = {
  "vendor-a": "vendors/vendor-a/quotation.xlsx",
  "vendor-b": "vendors/vendor-b/quotation.pdf",
  "vendor-c": "vendors/vendor-c/quotation.xlsx",
  "vendor-d": "vendors/vendor-d/scanned-quotation.pdf",
  "vendor-e": "vendors/vendor-e/photographed-rate-card.jpg",
};

const QUESTIONNAIRE_DOCUMENT: Record<VendorKey, string> = {
  "vendor-a": "vendors/vendor-a/questionnaire.pdf",
  "vendor-b": "vendors/vendor-b/questionnaire.docx",
  "vendor-c": "vendors/vendor-c/questionnaire.pdf",
  "vendor-d": "vendors/vendor-d/questionnaire.pdf",
  "vendor-e": "vendors/vendor-e/questionnaire.pdf",
};

/** Where each vendor's rows land in its own document. */
function sourceLocation(
  vendorKey: VendorKey,
  index: number,
): GroundTruthQuote["sourceLocation"] {
  switch (vendorKey) {
    case "vendor-a":
      return { sheet: "Quotation", row: 11 + index, column: "F" };
    case "vendor-c":
      return { sheet: "Sheet1", row: 9 + index, column: "F" };
    case "vendor-b":
      return { page: index < 27 ? 1 : 2 };
    case "vendor-d":
      return { page: index < 18 ? 1 : 2, row: index + 1 };
    case "vendor-e":
      return { page: 1, row: index + 1 };
  }
}

export const GROUND_TRUTH_QUOTES: GroundTruthQuote[] = VENDOR_KEYS.flatMap((vendorKey) =>
  buildVendorLines(vendorKey).map((line, index) => {
    const packSize = line.packQty ?? null;
    const expectation = quoteExpectation(
      vendorKey,
      line.skuCode,
      packSize,
      line.unitLabel,
      line.printedPrice,
      line.currency,
    );

    return {
      vendorKey,
      skuCode: line.skuCode,
      documentPath: QUOTE_DOCUMENT[vendorKey],
      sourceLocation: sourceLocation(vendorKey, index),
      vendorDescription: line.vendorDescription,
      quotedValue: line.printedPrice,
      currency: line.currency,
      quotedUnit: line.unitLabel,
      packSize,
      expectedNormalizedInr: expectation.normalized,
      expectedNormalizationStatus: expectation.status,
      knownAmbiguity: expectation.ambiguity,
    } satisfies GroundTruthQuote;
  }),
);

export const GROUND_TRUTH_FREIGHT: GroundTruthFreight[] = [
  {
    vendorKey: "vendor-a",
    documentPath: "vendors/vendor-a/quotation.xlsx",
    expectedStatus: "INCLUDED",
    expectedAmountInr: 0,
    sourceText: VENDOR_PROFILES["vendor-a"].freightStatement,
    knownAmbiguity: null,
  },
  {
    vendorKey: "vendor-b",
    documentPath: "vendors/vendor-b/quotation.pdf",
    expectedStatus: "EXTRA",
    expectedAmountInr: null,
    sourceText: VENDOR_PROFILES["vendor-b"].freightStatement,
    knownAmbiguity:
      "Freight is excluded and no rate is given. Landed cost cannot be computed for this vendor from the documents alone.",
  },
  {
    vendorKey: "vendor-c",
    documentPath: "vendors/vendor-c/commercial-email.txt",
    expectedStatus: "EXTRA",
    expectedAmountInr: VENDOR_C_FREIGHT_PER_PIECE,
    sourceText: `Freight to your plants will be charged extra at Rs. ${VENDOR_C_FREIGHT_PER_PIECE.toFixed(2)} per piece, flat, across all locations.`,
    knownAmbiguity:
      "The spreadsheet says nothing about freight. The charge appears only in the follow-up email, and comes with a conditional waiver above a 2.5 crore order value that requires the vendor's own internal approval.",
  },
  {
    vendorKey: "vendor-d",
    documentPath: "vendors/vendor-d/scanned-quotation.pdf",
    expectedStatus: "UNKNOWN",
    expectedAmountInr: null,
    sourceText: VENDOR_PROFILES["vendor-d"].freightStatement,
    knownAmbiguity:
      "Freight is included only within 200 km of Vapi and charged per kilometre beyond that. Without the distance to each of the 12 plants this resolves to neither included nor extra.",
  },
  {
    vendorKey: "vendor-e",
    documentPath: "vendors/vendor-e/photographed-rate-card.jpg",
    expectedStatus: "UNKNOWN",
    expectedAmountInr: null,
    sourceText: VENDOR_PROFILES["vendor-e"].freightStatement,
    knownAmbiguity:
      '"Freight: As applicable" states nothing. A handwritten margin note on the card asks "to each plant?", which is the buyer\'s own question left unanswered.',
  },
];

/**
 * Expected questionnaire verdicts.
 *
 * Two entries are the interesting ones. Vendor C's Q4 is a conditional yes that
 * does not meet a per-batch requirement, so it fails. Vendor E's Q5 is neither
 * a yes nor a no, so it is undeterminable — and an undeterminable answer to a
 * mandatory question is not the same as a pass.
 */
const ANSWER_VERDICTS: Record<VendorKey, Record<string, { passes: boolean | null; ambiguity: string | null }>> = {
  "vendor-a": {},
  "vendor-b": {},
  "vendor-c": {
    Q4: {
      passes: false,
      ambiguity:
        "The requirement is a certificate with every despatched batch. The vendor offers per-batch certificates only above 50,000 pieces and a consolidated monthly report below that, which does not meet the requirement. The follow-up email repeats the same caveat in softer language.",
    },
  },
  "vendor-d": {},
  "vendor-e": {
    Q5: {
      passes: null,
      ambiguity:
        "Neither a yes nor a no. The previous certificate lapsed in January 2026 and renewal is described as in process. Whether an expired certificate under renewal satisfies a mandatory certification requirement is a buyer judgement, not an extraction outcome.",
    },
  },
};

export const GROUND_TRUTH_QUESTIONNAIRE: GroundTruthQuestionnaireAnswer[] =
  VENDOR_KEYS.flatMap((vendorKey) =>
    QUESTIONNAIRE_ANSWERS[vendorKey].map((answer) => {
      const question = QUESTIONNAIRE.find((q) => q.ref === answer.ref)!;
      const override = ANSWER_VERDICTS[vendorKey][answer.ref];
      return {
        vendorKey,
        ref: answer.ref,
        documentPath: QUESTIONNAIRE_DOCUMENT[vendorKey],
        answerText: answer.answerText,
        mandatoryForEligibility: question.mandatoryForEligibility,
        expectedPasses: override
          ? override.passes
          : question.mandatoryForEligibility
            ? true
            : null,
        knownAmbiguity: override?.ambiguity ?? null,
      } satisfies GroundTruthQuestionnaireAnswer;
    }),
  );

export const GROUND_TRUTH_MISSING_LINES: GroundTruthMissingLine[] = VENDOR_KEYS.flatMap(
  (vendorKey) =>
    VENDOR_PROFILES[vendorKey].omittedSkus.map((skuCode) => ({
      vendorKey,
      skuCode,
      reason: `${VENDOR_PROFILES[vendorKey].name} did not quote ${skuCode}. No row for it appears in their document — there is no zero to mistake for a price.`,
    })),
);

/** Expected line coverage per vendor, against the 30-line RFx. */
export const GROUND_TRUTH_COVERAGE: Record<VendorKey, { quoted: number; expected: number }> =
  Object.fromEntries(
    VENDOR_KEYS.map((key) => [
      key,
      { quoted: LINE_ITEMS.length - VENDOR_PROFILES[key].omittedSkus.length, expected: LINE_ITEMS.length },
    ]),
  ) as Record<VendorKey, { quoted: number; expected: number }>;

export { VENDOR_E_QUOTE_FX, unitPriceInr };
