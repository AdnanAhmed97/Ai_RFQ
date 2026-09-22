import { describe, expect, it } from "vitest";
import { canReceiveAward, evaluateEligibility, type AnswerVerdict } from "@/lib/pricing/eligibility";

function verdict(over: Partial<AnswerVerdict> & Pick<AnswerVerdict, "ref">): AnswerVerdict {
  return {
    questionId: `q-${over.ref}`,
    question: "Question text",
    mandatoryForEligibility: true,
    passes: true,
    reasoning: "Stated plainly.",
    answered: true,
    ...over,
  };
}

describe("eligibility", () => {
  it("passes a supplier that met every mandatory requirement", () => {
    const result = evaluateEligibility({
      vendorId: "A",
      verdicts: [verdict({ ref: "Q1" }), verdict({ ref: "Q2" })],
    });
    expect(result.status).toBe("ELIGIBLE");
    expect(canReceiveAward(result)).toBe(true);
  });

  it("fails a supplier on a mandatory question, and names it", () => {
    const result = evaluateEligibility({
      vendorId: "C",
      verdicts: [
        verdict({ ref: "Q1" }),
        verdict({ ref: "Q4", passes: false, reasoning: "Certificates only above 50,000 pieces." }),
      ],
    });
    expect(result.status).toBe("INELIGIBLE");
    expect(result.failedQuestionRefs).toEqual(["Q4"]);
    expect(result.reasons[0]).toContain("Q4 not met");
    expect(canReceiveAward(result)).toBe(false);
  });

  it("treats an undeterminable answer as undetermined, not as a pass or a fail", () => {
    // The distinction the whole product turns on.
    const result = evaluateEligibility({
      vendorId: "E",
      verdicts: [
        verdict({ ref: "Q1" }),
        verdict({ ref: "Q5", passes: null, reasoning: "Certificate lapsed; renewal in process." }),
      ],
    });
    expect(result.status).toBe("UNDETERMINED");
    expect(result.undeterminedQuestionRefs).toEqual(["Q5"]);
    // Excluded by default; included only if the buyer knowingly accepts the risk.
    expect(canReceiveAward(result)).toBe(false);
    expect(canReceiveAward(result, { allowUndetermined: true })).toBe(true);
  });

  it("ignores questions that do not bear on eligibility", () => {
    const result = evaluateEligibility({
      vendorId: "A",
      verdicts: [
        verdict({ ref: "Q1" }),
        verdict({ ref: "Q3", mandatoryForEligibility: false, passes: false }),
      ],
    });
    expect(result.status).toBe("ELIGIBLE");
  });

  it("honours a scenario that makes an optional question mandatory", () => {
    const optional = verdict({
      ref: "Q9",
      mandatoryForEligibility: false,
      passes: false,
      reasoning: "Recycled content below the threshold.",
    });
    const result = evaluateEligibility({
      vendorId: "A",
      verdicts: [verdict({ ref: "Q1" }), optional],
      requiredQuestionIds: [optional.questionId],
    });
    expect(result.status).toBe("INELIGIBLE");
    expect(result.failedQuestionRefs).toEqual(["Q9"]);
  });

  it("flags a mandatory question the supplier never answered", () => {
    const result = evaluateEligibility({
      vendorId: "D",
      verdicts: [verdict({ ref: "Q2", passes: null, reasoning: null, answered: false })],
    });
    expect(result.status).toBe("UNDETERMINED");
    expect(result.unansweredQuestionRefs).toEqual(["Q2"]);
    expect(result.reasons[0]).toContain("was not answered");
  });
});
