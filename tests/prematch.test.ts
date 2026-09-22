import { describe, expect, it } from "vitest";
import { prematchLines } from "@/lib/extraction/prematch";
import type { RfxContext } from "@/lib/extraction/context";

const context: RfxContext = {
  rfqId: "r",
  title: "t",
  category: "c",
  pricingBasis: "per piece",
  currency: "INR",
  questions: [],
  lines: [
    {
      id: "plain-600",
      position: 1,
      skuCode: "CP-5R-008",
      description: "5-ply RSC shipper, 600 x 400 x 300 mm",
      specifications: { ply: "5", internalDimensionsMm: "600 x 400 x 300" },
      quantity: 10,
      unit: "piece",
    },
    {
      id: "printed-600",
      position: 2,
      skuCode: "CP-5P-014",
      description: "5-ply RSC printed shipper, 600 x 400 x 300 mm, 3-colour",
      specifications: { ply: "5", internalDimensionsMm: "600 x 400 x 300" },
      quantity: 10,
      unit: "piece",
    },
    {
      id: "three-ply",
      position: 3,
      skuCode: "CP-3R-001",
      description: "3-ply RSC shipper, 305 x 230 x 160 mm, plain",
      specifications: { ply: "3", internalDimensionsMm: "305 x 230 x 160" },
      quantity: 10,
      unit: "piece",
    },
  ],
};

const match = (descriptions: (string | null)[]) =>
  prematchLines({ context, vendorDescriptions: descriptions });

describe("deterministic pre-matching", () => {
  it("matches across house wording when ply and dimensions agree", () => {
    // "3Ply - 305x230x160" and "3-ply ... 305 x 230 x 160 mm" are the same item.
    const result = match(["Corrugated Box 3Ply - 305x230x160 (B Flute)"]);
    expect(result.resolved.get(0)?.rfqLineId).toBe("three-ply");
    expect(result.ambiguous).toEqual([]);
  });

  it("matches 'layer' to 'ply' — the wording the specification calls out", () => {
    const result = match(["CORR. SHIPPER 3-LAYER 305/230/160MM"]);
    expect(result.resolved.get(0)?.rfqLineId).toBe("three-ply");
  });

  it("separates a printed variant from the plain one at the same size", () => {
    const result = match([
      "Corrugated Box 5Ply - 600x400x300 (BC double wall Flute)",
      "Corrugated Box 5Ply Printed - 600x400x300 (BC double wall Flute)",
    ]);
    expect(result.resolved.get(0)?.rfqLineId).toBe("plain-600");
    expect(result.resolved.get(1)?.rfqLineId).toBe("printed-600");
  });

  it("defers to the model when dimensions are absent", () => {
    expect(match(["Angle Board, laminated"]).ambiguous).toEqual([0]);
  });

  it("defers when the size matches no RFx line", () => {
    expect(match(["Corrugated Box 5Ply - 999x999x999"]).ambiguous).toEqual([0]);
  });

  it("defers when ply cannot be read", () => {
    expect(match(["Corrugated Box - 600x400x300"]).ambiguous).toEqual([0]);
  });

  it("never guesses a line it is not certain of", () => {
    // Everything deferred is genuinely undecidable on specification alone.
    const result = match([null, "Wrap Sleeve 5Ply - 500x350", "Partition 4 Cavity"]);
    expect(result.resolved.size).toBe(0);
    expect(result.ambiguous).toEqual([0, 1, 2]);
  });
});
