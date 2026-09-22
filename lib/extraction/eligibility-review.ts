import "server-only";
import { getSql } from "@/lib/db/sql";
import type { AIProvider } from "@/lib/ai/provider";
import { EligibilityReviewSchema } from "@/lib/ai/schemas";
import { ELIGIBILITY_REVIEW_PROMPT } from "@/lib/ai/prompts";
import { evaluateEligibility, type AnswerVerdict } from "@/lib/pricing/eligibility";

/**
 * Classifies questionnaire answers, then enforces eligibility from the result.
 *
 * Two steps on purpose. The model judges language and writes its verdict to
 * `questionnaire_answers.passes`; the deterministic engine reads those verdicts
 * and decides who may receive an award. The model never decides eligibility,
 * and the engine never reads prose.
 */
export interface EligibilityReviewResult {
  vendorId: string;
  shortLabel: string;
  status: "ELIGIBLE" | "INELIGIBLE" | "UNDETERMINED";
  reasons: string[];
}

export async function reviewEligibility(params: {
  provider: AIProvider;
  rfqId: string;
}): Promise<EligibilityReviewResult[]> {
  const sql = getSql();

  const vendors = await sql<{ id: string; name: string; short_label: string }[]>`
    select id, name, short_label from vendors where rfq_id = ${params.rfqId} order by short_label
  `;

  const questions = await sql<
    { id: string; position: number; question: string; mandatory_for_eligibility: boolean }[]
  >`
    select id, position, question, mandatory_for_eligibility
      from questionnaire_questions where rfq_id = ${params.rfqId} order by position
  `;

  const results: EligibilityReviewResult[] = [];

  for (const vendor of vendors) {
    const answers = await sql<
      { question_id: string; position: number; raw_answer: string | null }[]
    >`
      select qa.question_id, qq.position, qa.raw_answer
        from questionnaire_answers qa
        join questionnaire_questions qq on qq.id = qa.question_id
       where qa.vendor_id = ${vendor.id}
       order by qq.position
    `;

    const governing = questions.filter((q) => q.mandatory_for_eligibility);
    const answerByQuestion = new Map(answers.map((a) => [a.question_id, a]));

    const asked = governing
      .map((question) => {
        const answer = answerByQuestion.get(question.id);
        return `<question ref="Q${question.position}">
  requirement: ${question.question}
  supplier answer: ${answer?.raw_answer ?? "(not answered)"}
</question>`;
      })
      .join("\n");

    const review = await params.provider.generateStructured({
      operation: "eligibility_review",
      system: ELIGIBILITY_REVIEW_PROMPT,
      cacheSystem: true,
      effort: "high",
      maxTokens: 8_000,
      schema: EligibilityReviewSchema,
      schemaName: "eligibility_review",
      messages: [
        {
          role: "user",
          content: `Judge ${vendor.name}'s answers against these ${governing.length} eligibility requirements.\n\n${asked}`,
        },
      ],
    });

    const verdictByRef = new Map(review.data.verdicts.map((v) => [v.questionRef.toUpperCase(), v]));

    const verdicts: AnswerVerdict[] = governing.map((question) => {
      const ref = `Q${question.position}`;
      const verdict = verdictByRef.get(ref);
      const answered = answerByQuestion.has(question.id);
      return {
        questionId: question.id,
        ref,
        question: question.question,
        mandatoryForEligibility: true,
        passes: answered ? (verdict?.passes ?? null) : null,
        reasoning: answered ? (verdict?.reasoning ?? null) : null,
        answered,
      };
    });

    for (const verdict of verdicts) {
      await sql`
        update questionnaire_answers
           set passes = ${verdict.passes}
         where vendor_id = ${vendor.id} and question_id = ${verdict.questionId}
      `;
    }

    const evaluated = evaluateEligibility({ vendorId: vendor.id, verdicts });

    // A failed or undetermined mandatory answer is a commercial issue the
    // exception centre must carry, not just a verdict on a page.
    await sql`
      delete from commercial_issues
       where rfq_id = ${params.rfqId} and vendor_id = ${vendor.id}
         and category = 'QUESTIONNAIRE_FAILURE'
    `;
    for (const verdict of verdicts) {
      if (verdict.passes === true) continue;
      await sql`
        insert into commercial_issues (rfq_id, vendor_id, category, severity, summary, detail)
        values (
          ${params.rfqId}, ${vendor.id}, 'QUESTIONNAIRE_FAILURE',
          ${verdict.passes === false ? "BLOCKER" : "WARNING"},
          ${verdict.passes === false ? `${verdict.ref} not met.` : `${verdict.ref} could not be determined.`},
          ${verdict.reasoning}
        )
      `;
    }

    results.push({
      vendorId: vendor.id,
      shortLabel: vendor.short_label,
      status: evaluated.status,
      reasons: evaluated.reasons,
    });
  }

  return results;
}
