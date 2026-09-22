import { NextResponse } from "next/server";
import { getSql, isSqlConfigured } from "@/lib/db/sql";
import { getSessionId } from "@/lib/session/session";
import { getProviderForSession } from "@/lib/ai/client";
import { AICredentialsMissingError } from "@/lib/ai/provider";
import { claim, listJobsForRfq, requeue } from "@/lib/jobs/queue";
import { runJob } from "@/lib/jobs/runner";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Processes ONE queued document per call.
 *
 * This is how the BYOK constraint and the asynchronous job model are reconciled.
 * The buyer's key is session-scoped and held only in this process's memory, so a
 * detached background worker would have no credential to run with. Driving the
 * queue one document per authenticated request keeps every model call inside a
 * request that carries the session, while job state still lives in the database
 * — so the UI, the domain model and the schema stay decoupled from the fact that
 * a request happens to be doing the work.
 *
 * The client calls this repeatedly until `remaining` reaches zero, which also
 * gives genuine per-document progress instead of one long opaque wait.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rfqId } = await params;

  if (!isSqlConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  // A failed run must be recoverable from the UI. Re-queueing is explicit —
  // nothing retries itself — but leaving no way to ask for it strands the
  // whole dataset behind a transient failure.
  const url = new URL(request.url);
  if (url.searchParams.get("action") === "retry") {
    const failed = (await listJobsForRfq(rfqId)).filter((j) => j.state === "FAILED");
    for (const job of failed) {
      await requeue(job.id);
      // attempt is incremented on claim; reset it so a retried job is not
      // immediately skipped for exceeding max_attempts.
      await getSql()`update extraction_jobs set attempt = 0 where id = ${job.id}`;
    }
    return NextResponse.json({ requeued: failed.length });
  }

  const sessionId = await getSessionId();
  let provider;
  try {
    provider = getProviderForSession(sessionId, "extraction_job");
  } catch (error) {
    if (error instanceof AICredentialsMissingError) {
      return NextResponse.json(
        { error: "Connect an AI provider before processing responses." },
        { status: 401 },
      );
    }
    throw error;
  }

  const job = await claim(`request-${rfqId.slice(0, 8)}`);
  if (!job) {
    return NextResponse.json({ done: true, remaining: 0, outcome: null });
  }

  const outcome = await runJob(job, provider);

  const sql = getSql();
  const [pending] = await sql<{ remaining: number }[]>`
    select count(*)::int as remaining from extraction_jobs
     where rfq_id = ${rfqId} and state = 'QUEUED'
  `;

  return NextResponse.json({
    done: (pending?.remaining ?? 0) === 0,
    remaining: pending?.remaining ?? 0,
    documentId: job.documentId,
    outcome,
  });
}

/** Current job state for the RFx. Polled by the responses screen. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rfqId } = await params;
  if (!isSqlConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }
  return NextResponse.json({ jobs: await listJobsForRfq(rfqId) });
}
