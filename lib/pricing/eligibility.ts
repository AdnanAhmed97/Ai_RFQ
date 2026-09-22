import type { UUID } from "@/types";

/**
 * Eligibility enforcement.
 *
 * The division of labour matters here. Whether "certificates are issued on
 * request for orders above 50,000 pieces" satisfies "a certificate with every
 * despatched batch" is a reading of language — the model's job. Whether a
 * supplier is therefore ineligible is a rule — this file's job, and it is
 * applied identically to every supplier with no exceptions.
 *
 * `null` is not `false`. An answer nobody could determine leaves eligibility
 * undetermined, which is a different thing from failing, and a buyer must be
 * told which one they are looking at.
 */

export interface AnswerVerdict {
  questionId: UUID;
  ref: string;
  question: string;
  mandatoryForEligibility: boolean;
  /** true passes, false fails, null could not be determined from the document. */
  passes: boolean | null;
  reasoning: string | null;
  /**
   * Whether the supplier answered at all.
   *
   * An answer that exists but has not yet been judged is not the same as one
   * the supplier never gave. Treating them alike reported five compliant
   * suppliers as having skipped a mandatory question.
   */
  answered: boolean;
}

export type EligibilityStatus = "ELIGIBLE" | "INELIGIBLE" | "UNDETERMINED";

export interface EligibilityResult {
  vendorId: UUID;
  status: EligibilityStatus;
  /** Plain-language reasons, each traceable to a question. */
  reasons: string[];
  failedQuestionRefs: string[];
  undeterminedQuestionRefs: string[];
  unansweredQuestionRefs: string[];
}

export function evaluateEligibility(params: {
  vendorId: UUID;
  verdicts: AnswerVerdict[];
  /** Question ids a scenario additionally insists on. */
  requiredQuestionIds?: UUID[];
}): EligibilityResult {
  const required = new Set(params.requiredQuestionIds ?? []);

  const governing = params.verdicts.filter(
    (verdict) => verdict.mandatoryForEligibility || required.has(verdict.questionId),
  );

  const failed = governing.filter((v) => v.passes === false);
  const undetermined = governing.filter((v) => v.passes === null && v.answered);
  const unanswered = governing.filter((v) => !v.answered);

  const reasons: string[] = [];
  for (const verdict of failed) {
    reasons.push(
      `${verdict.ref} not met: ${verdict.reasoning ?? verdict.question}`,
    );
  }
  for (const verdict of undetermined) {
    reasons.push(
      verdict.reasoning
        ? `${verdict.ref} could not be determined: ${verdict.reasoning}`
        : `${verdict.ref} has been answered but not yet reviewed.`,
    );
  }
  for (const verdict of unanswered) {
    reasons.push(`${verdict.ref} was not answered.`);
  }

  const status: EligibilityStatus =
    failed.length > 0
      ? "INELIGIBLE"
      : undetermined.length > 0 || unanswered.length > 0
        ? "UNDETERMINED"
        : "ELIGIBLE";

  if (status === "ELIGIBLE") {
    reasons.push(
      `All ${governing.length} eligibility requirements met.`,
    );
  }

  return {
    vendorId: params.vendorId,
    status,
    reasons,
    failedQuestionRefs: failed.map((v) => v.ref),
    undeterminedQuestionRefs: undetermined.map((v) => v.ref),
    unansweredQuestionRefs: unanswered.map((v) => v.ref),
  };
}

/**
 * Whether a supplier may receive an award under a given strictness.
 *
 * `strict` is the buyer's choice: an undetermined supplier is excluded when the
 * award must be defensible, and allowed when the buyer has decided to carry
 * that risk knowingly.
 */
export function canReceiveAward(
  result: EligibilityResult,
  options?: { allowUndetermined?: boolean },
): boolean {
  if (result.status === "ELIGIBLE") return true;
  if (result.status === "INELIGIBLE") return false;
  return options?.allowUndetermined ?? false;
}
