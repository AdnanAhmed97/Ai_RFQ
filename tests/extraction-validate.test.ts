import { describe, expect, it } from "vitest";
import { findMissingLines, validateExtraction } from "@/lib/extraction/validate";
import type { RfxContext } from "@/lib/extraction/context";
import type { DocumentExtraction, LineMatchBatch } from "@/lib/ai/schemas";

const context: RfxContext = {
  rfqId: "rfq-1",
  title: "Corrugated Packaging — FY27",
  category: "Corrugated Packaging",
  pricingBasis: "per piece",
  currency: "INR",
  lines: [
    { id: "line-1", position: 1, skuCode: "CP-001", description: "3-ply box", specifications: {}, quantity: 100, unit: "piece" },
    { id: "line-2", position: 2, skuCode: "CP-002", description: "5-ply box", specifications: {}, quantity: 200, unit: "piece" },
  ],
  questions: [
    { id: "q-1", ref: "Q1", question: "ISO certified?", type: "yes_no", mandatoryForEligibility: true },
  ],
};

function quote(overrides: Partial<DocumentExtraction["quotes"][number]> = {}) {
  return {
    rawDescription: "3 ply carton",
    quotedPrice: 12.5,
    currency: "INR" as const,
    quotedUnit: "per piece",
    quantityBasis: null,
    quantityBasisUnit: null,
    freight: { status: "UNKNOWN" as const, amount: null, currency: null, basis: null },
    taxesIncluded: null,
    taxRate: null,
    leadTimeDays: null,
    moq: null,
    confidence: "VERIFIED" as const,
    evidence: { page: 1, sheet: null, row: null, column: null, sourceText: "12.50" },
    concern: null,
    ...overrides,
  };
}

function extraction(quotes: DocumentExtraction["quotes"]): DocumentExtraction {
  return { documentSummary: "A quotation.", quotes, questionnaireAnswers: [], issues: [] };
}

function match(
  index: number,
  overrides: Partial<LineMatchBatch["matches"][number]> = {},
): LineMatchBatch["matches"][number] {
  return {
    vendorLineIndex: index,
    status: "MATCHED",
    rfqLineId: "line-1",
    score: 0.97,
    reasoning: "Same construction and dimensions.",
    candidates: [],
    ...overrides,
  };
}

describe("deterministic validation", () => {
  it("passes a clean, matched, evidenced quote", () => {
    const result = validateExtraction({
      context,
      extraction: extraction([quote()]),
      matches: [match(0)],
    });
    expect(result.issues).toEqual([]);
    expect(result.needsReview).toBe(false);
    expect(result.matchedLineIds).toEqual(["line-1"]);
  });

  it("blocks a per-bundle price with no stated pack size", () => {
    const result = validateExtraction({
      context,
      extraction: extraction([quote({ quotedUnit: "per bundle", quantityBasis: null })]),
      matches: [match(0)],
    });
    const issue = result.issues.find((i) => i.category === "MISSING_PACK_SIZE");
    expect(issue?.severity).toBe("BLOCKER");
    expect(result.needsReview).toBe(true);
  });

  it("accepts a per-bundle price when the pack size IS stated", () => {
    const result = validateExtraction({
      context,
      extraction: extraction([quote({ quotedUnit: "per bundle", quantityBasis: 100 })]),
      matches: [match(0)],
    });
    expect(result.issues.find((i) => i.category === "MISSING_PACK_SIZE")).toBeUndefined();
  });

  it("flags a foreign currency without rejecting the quote", () => {
    const result = validateExtraction({
      context,
      extraction: extraction([quote({ currency: "USD" })]),
      matches: [match(0)],
    });
    const issue = result.issues.find((i) => i.category === "CURRENCY_MISMATCH");
    expect(issue?.severity).toBe("WARNING");
    expect(result.matchedLineIds).toEqual(["line-1"]);
  });

  it("treats an unsourced value as a blocker", () => {
    const result = validateExtraction({
      context,
      extraction: extraction([
        quote({ evidence: { page: null, sheet: null, row: null, column: null, sourceText: null } }),
      ]),
      matches: [match(0)],
    });
    const issue = result.issues.find((i) => i.category === "LOW_EXTRACTION_CONFIDENCE");
    expect(issue?.severity).toBe("BLOCKER");
    expect(result.needsReview).toBe(true);
  });

  it("refuses to pick a winner when two vendor lines claim the same RFx line", () => {
    const result = validateExtraction({
      context,
      extraction: extraction([quote(), quote({ rawDescription: "3ply carton, same size" })]),
      matches: [match(0), match(1)],
    });
    const issue = result.issues.find((i) => i.category === "CONFLICTING_PRICE");
    expect(issue?.severity).toBe("BLOCKER");
    expect(issue?.summary).toContain("CP-001");
    // Neither is accepted — a wrong pick would corrupt a total nobody re-checks.
    expect(result.matchedLineIds).toEqual([]);
  });

  it("rejects a match pointing at an RFx line that does not exist", () => {
    const result = validateExtraction({
      context,
      extraction: extraction([quote()]),
      matches: [match(0, { rfqLineId: "line-does-not-exist" })],
    });
    const issue = result.issues.find((i) => i.category === "UNMATCHED_LINE");
    expect(issue?.severity).toBe("BLOCKER");
    expect(result.matchedLineIds).toEqual([]);
  });

  it("does not accept a REVIEW_REQUIRED line silently", () => {
    const result = validateExtraction({
      context,
      extraction: extraction([quote({ confidence: "REVIEW_REQUIRED" })]),
      matches: [match(0)],
    });
    expect(result.needsReview).toBe(true);
  });

  it("carries a concern the model raised through as a warning", () => {
    const result = validateExtraction({
      context,
      extraction: extraction([
        quote({ concern: "Freight stated only as 'as applicable'." }),
      ]),
      matches: [match(0)],
    });
    const raised = result.issues.find((i) =>
      i.summary.includes("as applicable"),
    );
    expect(raised).toBeDefined();
    expect(raised!.severity).toBe("WARNING");
  });

  it("reports lines the supplier never quoted, as absent rather than zero", () => {
    const issues = findMissingLines({ context, quotedLineIds: new Set(["line-1"]) });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.category).toBe("MISSING_LINE");
    expect(issues[0]!.rfqLineId).toBe("line-2");
    expect(issues[0]!.detail).toContain("absent, not zero");
  });

  it("reports nothing missing when every line was quoted", () => {
    expect(findMissingLines({ context, quotedLineIds: new Set(["line-1", "line-2"]) })).toEqual([]);
  });
});
