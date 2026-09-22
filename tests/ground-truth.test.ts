import { describe, expect, it } from "vitest";
import {
  GROUND_TRUTH_COVERAGE,
  GROUND_TRUTH_FREIGHT,
  GROUND_TRUTH_MISSING_LINES,
  GROUND_TRUTH_QUESTIONNAIRE,
  GROUND_TRUTH_QUOTES,
  GROUND_TRUTH_FX_USD_INR,
} from "@/fixtures/ground-truth";
import { LINE_ITEMS } from "@/fixtures/rfx/corrugated-fy27";
import { QUESTIONNAIRE } from "@/fixtures/rfx/questionnaire";
import { VENDOR_KEYS } from "@/fixtures/vendors/profiles";
import { buildVendorLines } from "@/fixtures/vendors/quote-data";
import { EXPECTED_DOCUMENTS } from "@/fixtures/generate";

describe("ground truth is internally consistent", () => {
  it("covers every quoted line and nothing else", () => {
    const expected = VENDOR_KEYS.reduce((n, k) => n + buildVendorLines(k).length, 0);
    expect(GROUND_TRUTH_QUOTES).toHaveLength(expected);
    expect(expected).toBe(144); // 30 + 27 + 30 + 29 + 28
  });

  it("records coverage matching the vendor documents", () => {
    for (const key of VENDOR_KEYS) {
      expect(GROUND_TRUTH_COVERAGE[key].quoted, key).toBe(buildVendorLines(key).length);
      expect(GROUND_TRUTH_COVERAGE[key].expected, key).toBe(30);
    }
  });

  it("points every quote at a real RFx line and a real fixture file", () => {
    const skus = new Set(LINE_ITEMS.map((l) => l.skuCode));
    const documents = new Set(VENDOR_KEYS.flatMap((k) => EXPECTED_DOCUMENTS[k]));
    for (const quote of GROUND_TRUTH_QUOTES) {
      expect(skus.has(quote.skuCode), quote.skuCode).toBe(true);
      expect(documents.has(quote.documentPath), quote.documentPath).toBe(true);
      expect(Object.keys(quote.sourceLocation).length, quote.skuCode).toBeGreaterThan(0);
    }
  });

  it("gives every quote a description that matches what the document prints", () => {
    for (const key of VENDOR_KEYS) {
      const lines = buildVendorLines(key);
      const truth = GROUND_TRUTH_QUOTES.filter((q) => q.vendorKey === key);
      for (const quote of truth) {
        const line = lines.find((l) => l.skuCode === quote.skuCode)!;
        expect(quote.vendorDescription, quote.skuCode).toBe(line.vendorDescription);
        expect(quote.quotedValue, quote.skuCode).toBe(line.printedPrice);
        expect(quote.currency, quote.skuCode).toBe(line.currency);
        expect(quote.packSize, quote.skuCode).toBe(line.packQty ?? null);
      }
    }
  });

  it("blocks normalization exactly where it cannot be done honestly", () => {
    const blocked = GROUND_TRUTH_QUOTES.filter(
      (q) => q.expectedNormalizationStatus === "BLOCKED",
    );
    expect(blocked).toHaveLength(3);
    for (const quote of blocked) {
      expect(quote.vendorKey).toBe("vendor-b");
      expect(quote.packSize, `${quote.skuCode} must have no stated pack size`).toBeNull();
      expect(quote.expectedNormalizedInr, quote.skuCode).toBeNull();
      expect(quote.knownAmbiguity, quote.skuCode).toBeTruthy();
    }
  });

  it("supplies a normalized value for every non-blocked quote, and none for blocked ones", () => {
    for (const quote of GROUND_TRUTH_QUOTES) {
      if (quote.expectedNormalizationStatus === "BLOCKED") {
        expect(quote.expectedNormalizedInr, quote.skuCode).toBeNull();
      } else {
        expect(quote.expectedNormalizedInr, quote.skuCode).toBeGreaterThan(0);
      }
    }
  });

  it("explains every non-VERIFIED outcome", () => {
    for (const quote of GROUND_TRUTH_QUOTES) {
      if (quote.expectedNormalizationStatus !== "VERIFIED") {
        expect(quote.knownAmbiguity, `${quote.vendorKey} ${quote.skuCode}`).toBeTruthy();
      }
    }
  });

  it("derives per-bundle and per-100 rates by exact division", () => {
    const converted = GROUND_TRUTH_QUOTES.filter((q) => q.packSize && q.packSize > 1);
    expect(converted.length).toBeGreaterThan(10);
    for (const quote of converted) {
      const expected = quote.quotedValue / quote.packSize!;
      expect(quote.expectedNormalizedInr!, quote.skuCode).toBeCloseTo(expected, 6);
    }
  });

  it("converts USD at the stated prototype rate and marks it inferred", () => {
    const usd = GROUND_TRUTH_QUOTES.filter((q) => q.currency === "USD");
    expect(usd).toHaveLength(4);
    for (const quote of usd) {
      expect(quote.expectedNormalizationStatus, quote.skuCode).toBe("INFERRED");
      expect(quote.expectedNormalizedInr!, quote.skuCode).toBeCloseTo(
        quote.quotedValue * GROUND_TRUTH_FX_USD_INR,
        4,
      );
    }
  });

  it("marks the contradicted and hand-corrected lines as conflicts", () => {
    const conflicts = GROUND_TRUTH_QUOTES.filter(
      (q) => q.expectedNormalizationStatus === "CONFLICT",
    );
    // Four revised by Vendor C's email, one struck through in pen on Vendor E's card.
    expect(conflicts).toHaveLength(5);
    expect(conflicts.filter((c) => c.vendorKey === "vendor-c")).toHaveLength(4);
    expect(conflicts.filter((c) => c.vendorKey === "vendor-e")).toHaveLength(1);
  });

  it("records a distinct freight position for every vendor", () => {
    expect(GROUND_TRUTH_FREIGHT).toHaveLength(5);
    expect(GROUND_TRUTH_FREIGHT.map((f) => f.expectedStatus)).toEqual([
      "INCLUDED",
      "EXTRA",
      "EXTRA",
      "UNKNOWN",
      "UNKNOWN",
    ]);
    for (const freight of GROUND_TRUTH_FREIGHT) {
      if (freight.expectedStatus === "UNKNOWN") {
        expect(freight.expectedAmountInr, freight.vendorKey).toBeNull();
        expect(freight.knownAmbiguity, freight.vendorKey).toBeTruthy();
      }
      expect(freight.sourceText.length, freight.vendorKey).toBeGreaterThan(0);
    }
  });

  it("answers every question for every vendor, against real question refs", () => {
    expect(GROUND_TRUTH_QUESTIONNAIRE).toHaveLength(50);
    const refs = new Set(QUESTIONNAIRE.map((q) => q.ref));
    for (const answer of GROUND_TRUTH_QUESTIONNAIRE) {
      expect(refs.has(answer.ref), answer.ref).toBe(true);
    }
  });

  it("fails exactly one mandatory answer and leaves exactly one undeterminable", () => {
    const mandatory = GROUND_TRUTH_QUESTIONNAIRE.filter((a) => a.mandatoryForEligibility);
    const failing = mandatory.filter((a) => a.expectedPasses === false);
    const undetermined = mandatory.filter((a) => a.expectedPasses === null);

    expect(failing).toHaveLength(1);
    expect(failing[0]!.vendorKey).toBe("vendor-c");
    expect(failing[0]!.ref).toBe("Q4");

    // Undeterminable is not the same as failing, and the distinction has to
    // survive into the eligibility engine.
    expect(undetermined).toHaveLength(1);
    expect(undetermined[0]!.vendorKey).toBe("vendor-e");
    expect(undetermined[0]!.ref).toBe("Q5");

    for (const answer of [...failing, ...undetermined]) {
      expect(answer.knownAmbiguity, `${answer.vendorKey}/${answer.ref}`).toBeTruthy();
    }
  });

  it("records the six missing lines and no others", () => {
    expect(GROUND_TRUTH_MISSING_LINES).toHaveLength(6);
    const skus = new Set(LINE_ITEMS.map((l) => l.skuCode));
    for (const missing of GROUND_TRUTH_MISSING_LINES) {
      expect(skus.has(missing.skuCode), missing.skuCode).toBe(true);
      // The line must genuinely be absent from that vendor's quote.
      const quoted = buildVendorLines(missing.vendorKey).some(
        (l) => l.skuCode === missing.skuCode,
      );
      expect(quoted, `${missing.vendorKey} ${missing.skuCode}`).toBe(false);
    }
  });

  it("never claims a vendor quoted a line it also lists as missing", () => {
    for (const missing of GROUND_TRUTH_MISSING_LINES) {
      const conflicting = GROUND_TRUTH_QUOTES.some(
        (q) => q.vendorKey === missing.vendorKey && q.skuCode === missing.skuCode,
      );
      expect(conflicting, `${missing.vendorKey} ${missing.skuCode}`).toBe(false);
    }
  });
});
