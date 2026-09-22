import { describe, expect, it } from "vitest";
import { calculateAward, calculateSingleVendorAwards, type ComparableQuote } from "@/lib/pricing/award";
import { paiseToRupees, rupeesToRate } from "@/lib/pricing/money";

const lines = [
  { rfqLineId: "l1", skuCode: "CP-001", quantity: 100 },
  { rfqLineId: "l2", skuCode: "CP-002", quantity: 200 },
];

function quote(over: Partial<ComparableQuote> & Pick<ComparableQuote, "rfqLineId" | "vendorId">): ComparableQuote {
  return {
    unitRateInr: rupeesToRate(10),
    landedRateInr: rupeesToRate(10),
    confidence: "VERIFIED",
    ...over,
  };
}

describe("award optimization", () => {
  it("picks the cheapest valid supplier per line", () => {
    const result = calculateAward({
      lines,
      quotes: [
        quote({ rfqLineId: "l1", vendorId: "A", unitRateInr: rupeesToRate(12), landedRateInr: rupeesToRate(12) }),
        quote({ rfqLineId: "l1", vendorId: "B", unitRateInr: rupeesToRate(11), landedRateInr: rupeesToRate(11) }),
        quote({ rfqLineId: "l2", vendorId: "A", unitRateInr: rupeesToRate(20), landedRateInr: rupeesToRate(20) }),
        quote({ rfqLineId: "l2", vendorId: "B", unitRateInr: rupeesToRate(22), landedRateInr: rupeesToRate(22) }),
      ],
      options: { eligibleVendorIds: null, includeFreight: true },
    });

    expect(result.complete).toBe(true);
    expect(result.allocations.map((a) => a.vendorId)).toEqual(["B", "A"]);
    // 100 × 11 + 200 × 20 = 1,100 + 4,000
    expect(paiseToRupees(result.totalPaise)).toBe(5100);
  });

  it("reports an unawarded line rather than substituting zero", () => {
    // The failure that would make a supplier who declined to quote look cheapest.
    const result = calculateAward({
      lines,
      quotes: [quote({ rfqLineId: "l1", vendorId: "A" })],
      options: { eligibleVendorIds: null, includeFreight: true },
    });

    expect(result.complete).toBe(false);
    expect(result.unawarded).toHaveLength(1);
    expect(result.unawarded[0]!.skuCode).toBe("CP-002");
    expect(result.unawarded[0]!.reason).toBe("No supplier quoted this line.");
    expect(result.allocations).toHaveLength(1);
  });

  it("awards nothing when the eligible list is empty, rather than everything", () => {
    // An empty list means no supplier qualifies. Reading it as "no filter"
    // silently awarded every line to a supplier that had been excluded.
    const result = calculateAward({
      lines: [lines[0]!],
      quotes: [quote({ rfqLineId: "l1", vendorId: "A" })],
      options: { eligibleVendorIds: [], includeFreight: true },
    });
    expect(result.allocations).toHaveLength(0);
    expect(result.unawarded[0]!.reason).toContain("excluded by the eligibility rules");
  });

  it("excludes ineligible suppliers and says so when that empties a line", () => {
    const result = calculateAward({
      lines: [lines[0]!],
      quotes: [quote({ rfqLineId: "l1", vendorId: "C" })],
      options: { eligibleVendorIds: ["A", "B"], includeFreight: true },
    });
    expect(result.unawarded[0]!.reason).toContain("excluded by the eligibility rules");
  });

  it("refuses to award a BLOCKED quote", () => {
    const result = calculateAward({
      lines: [lines[0]!],
      quotes: [quote({ rfqLineId: "l1", vendorId: "A", confidence: "BLOCKED" })],
      options: { eligibleVendorIds: null, includeFreight: true },
    });
    expect(result.allocations).toHaveLength(0);
    expect(result.unawarded[0]!.reason).toContain("cannot be used in an award");
  });

  it("refuses to award a CONFLICT quote", () => {
    const result = calculateAward({
      lines: [lines[0]!],
      quotes: [quote({ rfqLineId: "l1", vendorId: "A", confidence: "CONFLICT" })],
      options: { eligibleVendorIds: null, includeFreight: true },
    });
    expect(result.allocations).toHaveLength(0);
  });

  it("cannot compare landed cost when freight is unresolved for everyone", () => {
    const result = calculateAward({
      lines: [lines[0]!],
      quotes: [quote({ rfqLineId: "l1", vendorId: "A", landedRateInr: null })],
      options: { eligibleVendorIds: null, includeFreight: true },
    });
    expect(result.unawarded[0]!.reason).toContain("Freight is unresolved");
  });

  it("still compares ex-freight when freight is unresolved", () => {
    const result = calculateAward({
      lines: [lines[0]!],
      quotes: [quote({ rfqLineId: "l1", vendorId: "A", landedRateInr: null })],
      options: { eligibleVendorIds: null, includeFreight: false },
    });
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]!.basis).toBe("EX_FREIGHT");
  });

  it("reports evidence coverage as the VERIFIED share of awarded value", () => {
    const result = calculateAward({
      lines,
      quotes: [
        quote({ rfqLineId: "l1", vendorId: "A", unitRateInr: rupeesToRate(10), landedRateInr: rupeesToRate(10) }),
        quote({ rfqLineId: "l2", vendorId: "A", unitRateInr: rupeesToRate(10), landedRateInr: rupeesToRate(10), confidence: "INFERRED" }),
      ],
      options: { eligibleVendorIds: null, includeFreight: true },
    });
    // 1,000 verified of 3,000 total.
    expect(result.evidenceCoverage).toBeCloseTo(1 / 3, 6);
    expect(result.inferredLineCount).toBe(1);
  });

  it("records how close the runner-up was", () => {
    const result = calculateAward({
      lines: [lines[0]!],
      quotes: [
        quote({ rfqLineId: "l1", vendorId: "A", unitRateInr: rupeesToRate(10), landedRateInr: rupeesToRate(10) }),
        quote({ rfqLineId: "l1", vendorId: "B", unitRateInr: rupeesToRate(11), landedRateInr: rupeesToRate(11) }),
      ],
      options: { eligibleVendorIds: null, includeFreight: true },
    });
    expect(paiseToRupees(result.allocations[0]!.marginOverNextPaise!)).toBe(100);
  });

  it("marks a single-vendor award incomplete when that supplier missed a line", () => {
    const results = calculateSingleVendorAwards({
      lines,
      quotes: [
        quote({ rfqLineId: "l1", vendorId: "A" }),
        quote({ rfqLineId: "l2", vendorId: "A" }),
        quote({ rfqLineId: "l1", vendorId: "B" }),
      ],
      vendorIds: ["A", "B"],
      options: { eligibleVendorIds: null, includeFreight: true },
    });

    expect(results.get("A")!.complete).toBe(true);
    // B quoted one of two lines and cannot take the whole award.
    expect(results.get("B")!.complete).toBe(false);
    expect(results.get("B")!.unawarded).toHaveLength(1);
  });
});
