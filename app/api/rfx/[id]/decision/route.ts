import { NextResponse } from "next/server";
import { getSql, isSqlConfigured } from "@/lib/db/sql";
import { getSessionId } from "@/lib/session/session";
import { getProviderForSession } from "@/lib/ai/client";
import { AICredentialsMissingError } from "@/lib/ai/provider";
import { DECISION_AGENT_PROMPT } from "@/lib/ai/prompts";
import { buildDecisionTools } from "@/lib/tools/registry";
import { buildToolImplementations } from "@/lib/tools/implementations";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The Decision Copilot.
 *
 * The model picks tools and explains results; every figure it quotes came out
 * of a deterministic calculation over the persisted commercial truth. The tool
 * invocations are returned alongside the answer so the buyer can see which
 * calculation produced which number — an answer whose working is hidden is an
 * assertion, whatever produced it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rfqId } = await params;

  if (!isSqlConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    question?: string;
    sessionId?: string;
  } | null;

  if (!body?.question?.trim()) {
    return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  }

  const sql = getSql();
  const [truth] = await sql<{ count: number }[]>`
    select count(*)::int from commercial_truth where rfq_id = ${rfqId}
  `;
  if ((truth?.count ?? 0) === 0) {
    return NextResponse.json(
      { error: "Build the comparison first — there is nothing to reason over yet." },
      { status: 409 },
    );
  }

  let provider;
  try {
    provider = getProviderForSession(await getSessionId(), "decision_copilot");
  } catch (error) {
    if (error instanceof AICredentialsMissingError) {
      return NextResponse.json({ error: "Connect an AI provider first." }, { status: 401 });
    }
    throw error;
  }

  // Conversation state lives in the database so a reload does not lose it.
  let chatSessionId = body.sessionId;
  if (!chatSessionId) {
    const [created] = await sql<{ id: string }[]>`
      insert into chat_sessions (rfq_id, surface) values (${rfqId}, 'DECISION_COPILOT') returning id
    `;
    chatSessionId = created!.id;
  }

  const history = await sql<{ role: string; content: string }[]>`
    select role::text as role, content from chat_messages
     where session_id = ${chatSessionId} and role in ('user', 'assistant')
     order by created_at limit 20
  `;

  await sql`
    insert into chat_messages (session_id, role, content)
    values (${chatSessionId}, 'user', ${body.question})
  `;

  const tools = buildDecisionTools(buildToolImplementations(rfqId));

  const result = await provider.runToolAgent({
    operation: "decision_copilot",
    system: `${DECISION_AGENT_PROMPT}

The RFx under discussion has id ${rfqId}. Pass it as rfqId to every tool that takes one.`,
    cacheSystem: true,
    effort: "high",
    maxTokens: 16_000,
    maxIterations: 10,
    tools,
    messages: [
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: body.question },
    ],
  });

  await sql`
    insert into chat_messages (session_id, role, content, tool_calls)
    values (
      ${chatSessionId}, 'assistant', ${result.text},
      ${sql.json(
        result.toolInvocations.map((invocation) => ({
          name: invocation.name,
          input: invocation.input,
          resultStatus: invocation.status,
        })) as never,
      )}
    )
  `;

  return NextResponse.json({
    sessionId: chatSessionId,
    answer: result.text,
    truncated: result.truncated,
    // Shown under the answer: which calculation produced which number.
    toolCalls: result.toolInvocations.map((invocation) => ({
      name: invocation.name,
      status: invocation.status,
      durationMs: invocation.durationMs,
      error: invocation.error,
    })),
    usage: result.usage,
  });
}
