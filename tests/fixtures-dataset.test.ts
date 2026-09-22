import { describe, expect, it } from "vitest";
import { LINE_ITEMS } from "@/fixtures/rfx/corrugated-fy27";
import { EVALUATION_CRITERIA, QUESTIONNAIRE } from "@/fixtures/rfx/questionnaire";
import { VENDOR_KEYS, VENDOR_PROFILES } from "@/fixtures/vendors/profiles";
import { buildVendorLines } from "@/fixtures/vendors/quote-data";
import { QUESTIONNAIRE_ANSWERS } from "@/fixtures/vendors/questionnaire-answers";
import { EXPECTED_DOCUMENTS } from "@/fixtures/generate";

describe("demo RFx", () => {
  it("has exactly 30 line items", () => {
    expect(LINE_ITEMS).toHaveLength(30);
  });

  it("numbers lines contiguously from 1, so 'Line 014' means one thing", () => {
    expect(LINE_ITEMS.map((l) => l.position)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
  });

  it("gives every line a unique SKU, a positive quantity and a unit", () => {
    expect(new Set(LINE_ITEMS.map((l) => l.skuCode)).size).toBe(30);
    for (const line of LINE_ITEMS) {
      expect(line.quantity, line.skuCode).toBeGreaterThan(0);
      expect(line.unit, line.skuCode).toBeTruthy();
      expect(line.basePriceInr, line.skuCode).toBeGreaterThan(0);
      expect(Object.keys(line.specifications).length, line.skuCode).toBeGreaterThanOrEqual(3);
    }
  });

  it("totals a realistic contract value rather than an arbitrary one", () => {
    const total = LINE_ITEMS.reduce((sum, l) => sum + l.quantity * l.basePriceInr, 0);
    expect(total).toBeGreaterThan(3.5e7);
    expect(total).toBeLessThan(5e7);
  });

  it("has a 10-question questionnaire with 4 eligibility-bearing questions", () => {
    expect(QUESTIONNAIRE).toHaveLength(10);
    expect(QUESTIONNAIRE.filter((q) => q.mandatoryForEligibility).map((q) => q.ref)).toEqual([
      "Q1",
      "Q2",
      "Q4",
      "Q5",
    ]);
  });

  it("gives select questions their options, so an answer can be validated", () => {
    for (const q of QUESTIONNAIRE) {
      if (q.type === "single_select" || q.type === "multi_select") {
        expect(q.options?.length, q.ref).toBeGreaterThan(1);
      }
    }
  });

  it("has evaluation criteria weighted to 100", () => {
    expect(EVALUATION_CRITERIA.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });
});

describe("vendors", () => {
  it("has exactly 5", () => {
    expect(VENDOR_KEYS).toHaveLength(5);
    expect(Object.keys(VENDOR_PROFILES)).toHaveLength(5);
  });

  it("gives each vendor a distinct identity and short label", () => {
    const labels = VENDOR_KEYS.map((k) => VENDOR_PROFILES[k].shortLabel);
    const names = VENDOR_KEYS.map((k) => VENDOR_PROFILES[k].name);
    const gstins = VENDOR_KEYS.map((k) => VENDOR_PROFILES[k].gstin);
    expect(new Set(labels).size).toBe(5);
    expect(new Set(names).size).toBe(5);
    expect(new Set(gstins).size).toBe(5);
  });

  it("matches the line coverage the specification calls for", () => {
    const coverage = Object.fromEntries(
      VENDOR_KEYS.map((k) => [k, buildVendorLines(k).length]),
    );
    expect(coverage).toEqual({
      "vendor-a": 30,
      "vendor-b": 27,
      "vendor-c": 30,
      "vendor-d": 29,
      "vendor-e": 28,
    });
  });

  it("gives every vendor its own wording, with no duplicate descriptions within a quote", () => {
    for (const key of VENDOR_KEYS) {
      const descriptions = buildVendorLines(key).map((l) => l.vendorDescription);
      expect(new Set(descriptions).size, `${key} has duplicate line descriptions`).toBe(
        descriptions.length,
      );
    }
  });

  it("never reproduces the RFx description verbatim, so matching is not string equality", () => {
    const rfxDescriptions = new Set(LINE_ITEMS.map((l) => l.description.toLowerCase()));
    for (const key of VENDOR_KEYS) {
      for (const line of buildVendorLines(key)) {
        expect(
          rfxDescriptions.has(line.vendorDescription.toLowerCase()),
          `${key} ${line.skuCode} copies the RFx wording`,
        ).toBe(false);
      }
    }
  });

  it("answers every questionnaire question for every vendor", () => {
    for (const key of VENDOR_KEYS) {
      const refs = QUESTIONNAIRE_ANSWERS[key].map((a) => a.ref);
      expect(refs, key).toEqual(QUESTIONNAIRE.map((q) => q.ref));
    }
  });

  it("gives each vendor the document set the specification defines", () => {
    expect(EXPECTED_DOCUMENTS["vendor-a"]).toHaveLength(3);
    expect(EXPECTED_DOCUMENTS["vendor-b"]).toHaveLength(2);
    expect(EXPECTED_DOCUMENTS["vendor-c"]).toHaveLength(3);
    expect(EXPECTED_DOCUMENTS["vendor-d"]).toHaveLength(2);
    expect(EXPECTED_DOCUMENTS["vendor-e"]).toHaveLength(2);
  });

  it("covers all five document formats across the vendor set", () => {
    const extensions = new Set(
      VENDOR_KEYS.flatMap((k) => EXPECTED_DOCUMENTS[k]).map((p) => p.slice(p.lastIndexOf("."))),
    );
    expect(extensions).toEqual(new Set([".xlsx", ".pdf", ".docx", ".txt", ".jpg"]));
  });
});

describe("determinism", () => {
  it("produces identical quote data on repeated builds", () => {
    for (const key of VENDOR_KEYS) {
      expect(JSON.stringify(buildVendorLines(key))).toBe(JSON.stringify(buildVendorLines(key)));
    }
  });

  it("varies pricing per line rather than applying one flat multiplier", () => {
    // A uniform multiplier would make every split-award decision degenerate.
    const ratios = buildVendorLines("vendor-c")
      .filter((l) => l.unitLabel === "per piece")
      .map((l) => {
        const rfx = LINE_ITEMS.find((r) => r.skuCode === l.skuCode)!;
        return l.printedPrice / rfx.basePriceInr;
      });
    expect(new Set(ratios.map((r) => r.toFixed(4))).size).toBeGreaterThan(5);
  });
});
