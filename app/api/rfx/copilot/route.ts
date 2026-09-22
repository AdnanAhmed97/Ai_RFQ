import { NextResponse } from "next/server";
import { getSql, isSqlConfigured } from "@/lib/db/sql";
import { getSessionId } from "@/lib/session/session";
import { getProviderForSession } from "@/lib/ai/client";
import { AICredentialsMissingError } from "@/lib/ai/provider";
import { CopilotTurnSchema, RFxDraftSchema } from "@/lib/ai/schemas";
import {
  RFX_CLARIFICATION_PROMPT,
  RFX_DRAFT_PROMPT,
  RFX_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The RFx creation copilot.
 *
 * Two modes over one endpoint. `turn` continues the conversation and returns
 * what it learned; `draft` generates the structured RFx and persists it. The
 * split matters: the copilot must be able to ask before it writes, and the
 * buyer must be able to see what it thinks it knows before it commits.
 */
export async function POST(request: Request) {
  if (!isSqlConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    mode?: "turn" | "draft";
    messages?: { role: "user" | "assistant"; content: string }[];
    context?: Record<string, unknown>;
  } | null;

  if (!body?.messages?.length) {
    return NextResponse.json({ error: "Say what you need." }, { status: 400 });
  }

  let provider;
  try {
    provider = getProviderForSession(await getSessionId(), "rfx_copilot");
  } catch (error) {
    if (error instanceof AICredentialsMissingError) {
      return NextResponse.json({ error: "Connect an AI provider first." }, { status: 401 });
    }
    throw error;
  }

  const known = JSON.stringify(body.context ?? {}, null, 2);

  // --- Conversation ------------------------------------------------------
  if ((body.mode ?? "turn") === "turn") {
    const result = await provider.generateStructured({
      operation: "rfx_copilot_turn",
      system: RFX_SYSTEM_PROMPT,
      cacheSystem: true,
      effort: "medium",
      maxTokens: 8_000,
      schema: CopilotTurnSchema,
      schemaName: "copilot_turn",
      messages: [
        ...body.messages,
        { role: "user", content: RFX_CLARIFICATION_PROMPT.replace("{{CONTEXT}}", known) },
      ],
    });
    return NextResponse.json(result.data);
  }

  // --- Draft -------------------------------------------------------------
  const requirement = body.messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n\n");

  const draft = await provider.generateStructured({
    operation: "rfx_draft",
    system: RFX_SYSTEM_PROMPT,
    cacheSystem: true,
    effort: "high",
    maxTokens: 32_000,
    schema: RFxDraftSchema,
    schemaName: "rfx_draft",
    messages: [
      {
        role: "user",
        content: RFX_DRAFT_PROMPT.replace("{{REQUIREMENT}}", requirement).replace(
          "{{CONTEXT}}",
          known,
        ),
      },
    ],
  });

  const output = draft.data;
  const sql = getSql();

  const rfqId = await sql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      insert into users (email, display_name, role)
      values ('buyer@northfieldconsumer.co.in', 'Category Buyer', 'BUYER')
      on conflict (email) do update set display_name = excluded.display_name
      returning id
    `;

    const [rfq] = await tx<{ id: string }[]>`
      insert into rfqs (
        owner_id, title, category, objective, scope, geography,
        status, creation_state, commercial_terms
      ) values (
        ${user!.id}, ${output.title}, ${output.category}, ${output.objective}, ${output.scope},
        ${output.geography}, 'DRAFT', 'REVIEW', ${tx.json(output.commercialTerms)}
      )
      returning id
    `;

    for (const [index, line] of output.lineItems.entries()) {
      await tx`
        insert into rfq_line_items (
          rfq_id, position, sku_code, description, specifications, quantity, unit, currency, notes
        ) values (
          ${rfq!.id}, ${index + 1}, ${line.skuCode}, ${line.description},
          ${tx.json(line.specifications)}, ${line.quantity}, ${line.unit},
          ${output.commercialTerms.currency}, ${line.notes}
        )
      `;
    }

    for (const [index, question] of output.questionnaire.entries()) {
      await tx`
        insert into questionnaire_questions (
          rfq_id, position, question, type, required, mandatory_for_eligibility, options
        ) values (
          ${rfq!.id}, ${index + 1}, ${question.question}, ${question.type},
          ${question.required}, ${question.mandatoryForEligibility}, ${question.options}
        )
      `;
    }

    for (const criterion of output.evaluationCriteria) {
      await tx`
        insert into evaluation_criteria (rfq_id, label, weight, description)
        values (${rfq!.id}, ${criterion.label}, ${criterion.weight}, ${criterion.description})
      `;
    }

    // Anything the copilot chose that the buyer did not state is recorded as an
    // assumption, not absorbed into the document as though it were a fact.
    for (const assumption of output.assumptions) {
      await tx`
        insert into rfq_assumptions (rfq_id, statement, origin, rationale)
        values (${rfq!.id}, ${assumption.statement}, ${assumption.origin}, ${assumption.rationale})
      `;
    }

    for (const question of output.unresolvedQuestions) {
      await tx`
        insert into rfq_clarifications (rfq_id, question, suggested_answers)
        values (${rfq!.id}, ${question.question}, ${question.suggestedAnswers})
      `;
    }

    return rfq!.id;
  });

  return NextResponse.json({
    rfqId,
    title: output.title,
    lineItemCount: output.lineItems.length,
    questionCount: output.questionnaire.length,
    assumptionCount: output.assumptions.length,
    unresolvedCount: output.unresolvedQuestions.length,
  });
}
