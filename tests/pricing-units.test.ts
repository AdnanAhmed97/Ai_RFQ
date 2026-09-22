import { describe, expect, it } from "vitest";
import { normalizeUnit } from "@/lib/pricing/units";
import { rateToRupees } from "@/lib/pricing/money";

const base = { rfxUnit: "piece" as const };

describe("unit normalization", () => {
  it("converts a per-100 price by exact division", () => {
    const result = normalizeUnit({ ...base, quotedPrice: 4200, quotedUnit: "per 100 pcs", quantityBasis: null });
    expect(result.status).toBe("NORMALIZED");
    if (result.status !== "NORMALIZED") return;
    expect(rateToRupees(result.rate)).toBe(42);
    expect(result.derivation).toContain("÷ 100");
    expect(result.confidence).toBe("VERIFIED");
  });

  it("converts a per-bundle price when the document states the bundle size", () => {
    const result = normalizeUnit({ ...base, quotedPrice: 598, quotedUnit: "per bundle", quantityBasis: 100 });
    expect(result.status).toBe("NORMALIZED");
    if (result.status !== "NORMALIZED") return;
    expect(rateToRupees(result.rate)).toBeCloseTo(5.98, 6);
  });

  it("BLOCKS a per-bundle price with no stated bundle size", () => {
    // The single most important rule in the product.
    const result = normalizeUnit({ ...base, quotedPrice: 467.5, quotedUnit: "per bundle", quantityBasis: null });
    expect(result.status).toBe("BLOCKED");
    if (result.status !== "BLOCKED") return;
    expect(result.reason).toContain("does not state how many");
    expect(result.resolution).toContain("pack quantity");
  });

  it("BLOCKS a per-box price with no pack size — the specification's own example", () => {
    const result = normalizeUnit({ ...base, quotedPrice: 1250, quotedUnit: "per box", quantityBasis: null });
    expect(result.status).toBe("BLOCKED");
  });

  it("converts a per-box price when pack size is known", () => {
    const result = normalizeUnit({ ...base, quotedPrice: 1200, quotedUnit: "per box", quantityBasis: 12 });
    expect(result.status).toBe("NORMALIZED");
    if (result.status !== "NORMALIZED") return;
    expect(rateToRupees(result.rate)).toBeCloseTo(100, 6);
  });

  it("passes through a price already quoted per piece", () => {
    const result = normalizeUnit({ ...base, quotedPrice: 12.64, quotedUnit: "per pc", quantityBasis: null });
    expect(result.status).toBe("NORMALIZED");
    if (result.status !== "NORMALIZED") return;
    expect(rateToRupees(result.rate)).toBeCloseTo(12.64, 6);
  });

  it("accepts a bare unit token from a spreadsheet UOM column", () => {
    // Spreadsheets carry the basis as "Nos", not "per piece". Requiring the
    // word "per" blocked 42 ordinary lines on the real dataset.
    for (const unit of ["Nos", "NOS", "Pcs", "PC", "each", "Set", "Roll"]) {
      const result = normalizeUnit({ ...base, quotedPrice: 12.64, quotedUnit: unit, quantityBasis: null });
      expect(result.status, `${unit} should normalize`).toBe("NORMALIZED");
    }
  });

  it("BLOCKS when the document states no basis at all", () => {
    expect(normalizeUnit({ ...base, quotedPrice: 50, quotedUnit: null, quantityBasis: null }).status).toBe("BLOCKED");
  });

  it("BLOCKS an unrecognised basis rather than assuming per-unit", () => {
    const result = normalizeUnit({ ...base, quotedPrice: 50, quotedUnit: "per running metre", quantityBasis: null });
    expect(result.status).toBe("BLOCKED");
  });

  it("never returns a rate on a blocked path", () => {
    const blocked = [
      { quotedPrice: 467.5, quotedUnit: "per bundle", quantityBasis: null },
      { quotedPrice: 1250, quotedUnit: "per box", quantityBasis: null },
      { quotedPrice: 50, quotedUnit: null, quantityBasis: null },
    ];
    for (const input of blocked) {
      const result = normalizeUnit({ ...base, ...input });
      expect(result).not.toHaveProperty("rate");
    }
  });
});
