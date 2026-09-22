import { describe, expect, it } from "vitest";
import {
  DocumentExtractionSchema,
  ExtractedQuoteSchema,
} from "@/lib/ai/schemas";

/**
 * These assert the product's central data rule: a value the source does not
 * state must be expressible as absent. If the schema ever stops accepting null
 * here, the model's only way to satisfy it is to invent a number.
 */
describe("extraction schema", () => {
  const baseQuote = {
    rawDescription: "5 layer carton 600x400x300",
    quotedPrice: 1250,
    currency: "INR" as const,
    quotedUnit: "per box",
    quantityBasis: null,
    quantityBasisUnit: null,
    freight: { status: "UNKNOWN" as const, amount: null, currency: null, basis: null },
    taxesIncluded: null,
    taxRate: null,
    leadTimeDays: null,
    moq: null,
    confidence: "BLOCKED" as const,
    evidence: { page: 2, sheet: null, row: null, column: null, sourceText: "₹1,250 / box" },
    concern: "Quoted per box with no stated pack size anywhere in the document.",
  };

  it("accepts a per-box price with an unknown pack size, marked BLOCKED", () => {
    const result = ExtractedQuoteSchema.safeParse(baseQuote);
    expect(result.success).toBe(true);
  });

  it("requires an evidence reference, so no value arrives unsourced", () => {
    const { evidence: _evidence, ...withoutEvidence } = baseQuote;
    expect(ExtractedQuoteSchema.safeParse(withoutEvidence).success).toBe(false);
  });

  it("allows every commercial field to be null, so nothing has to be invented", () => {
    const result = ExtractedQuoteSchema.safeParse({
      ...baseQuote,
      quotedPrice: null,
      currency: null,
      quotedUnit: null,
      confidence: "REVIEW_REQUIRED" as const,
      concern: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a confidence value outside the five defined states", () => {
    const result = ExtractedQuoteSchema.safeParse({ ...baseQuote, confidence: "HIGH" });
    expect(result.success).toBe(false);
  });

  it("accepts a document that yielded no quotes at all", () => {
    const result = DocumentExtractionSchema.safeParse({
      documentSummary: "Signed quality questionnaire, no pricing.",
      quotes: [],
      questionnaireAnswers: [],
      issues: [],
    });
    expect(result.success).toBe(true);
  });
});
