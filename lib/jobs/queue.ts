import "server-only";
import { getSql } from "@/lib/db/sql";
import {
  InvalidJobTransitionError,
  STATE_PROGRESS,
  canTransition,
  isTerminal,
  type ExtractionJob,
  type ExtractionJobEvent,
  type ExtractionJobState,
} from "./types";

/**
 * Database-backed extraction job queue.
 *
 * Deliberately not distributed. `claim` uses SELECT ... FOR UPDATE SKIP LOCKED,
 * which is the one thing worth getting right now: it is what makes the queue
 * correct under more than one runner, and it costs nothing to write today.
 */

interface JobRow {
  id: string;
  rfq_id: string;
  vendor_response_id: string;
  document_id: string;
  state: ExtractionJobState;
  progress: number;
  attempt: number;
  max_attempts: number;
  claimed_at: Date | null;
  claimed_by: string | null;
  queued_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  duration_ms: number | null;
  error: string | null;
  review_reason: string | null;
}

function toJob(row: JobRow): ExtractionJob {
  return {
    id: row.id,
    rfqId: row.rfq_id,
    vendorResponseId: row.vendor_response_id,
    documentId: row.document_id,
    state: row.state,
    progress: row.progress,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    claimedAt: row.claimed_at?.toISOString(),
    claimedBy: row.claimed_by ?? undefined,
    queuedAt: row.queued_at.toISOString(),
    startedAt: row.started_at?.toISOString(),
    finishedAt: row.finished_at?.toISOString(),
    durationMs: row.duration_ms ?? undefined,
    error: row.error ?? undefined,
    reviewReason: row.review_reason ?? undefined,
  };
}

/** Enqueues one document. Idempotent: re-enqueuing a document returns its job. */
export async function enqueue(params: {
  rfqId: string;
  vendorResponseId: string;
  documentId: string;
}): Promise<ExtractionJob> {
  const sql = getSql();
  const [row] = await sql<JobRow[]>`
    insert into extraction_jobs (rfq_id, vendor_response_id, document_id)
    values (${params.rfqId}, ${params.vendorResponseId}, ${params.documentId})
    on conflict (document_id) do update set document_id = excluded.document_id
    returning *
  `;
  return toJob(row!);
}

/**
 * Claims the oldest queued job.
 *
 * SKIP LOCKED means two runners never take the same job, and a runner blocked
 * on one row does not stall the others.
 */
export async function claim(runnerId: string): Promise<ExtractionJob | null> {
  const sql = getSql();
  const rows = await sql<JobRow[]>`
    with next_job as (
      select id from extraction_jobs
      where state = 'QUEUED' and attempt < max_attempts
      order by queued_at
      limit 1
      for update skip locked
    )
    update extraction_jobs j
       set state      = 'PROCESSING',
           progress   = ${STATE_PROGRESS.PROCESSING},
           attempt    = j.attempt + 1,
           claimed_at = now(),
           claimed_by = ${runnerId},
           started_at = coalesce(j.started_at, now())
      from next_job
     where j.id = next_job.id
     returning j.*
  `;

  const row = rows[0];
  if (!row) return null;

  await recordEvent(row.id, "QUEUED", "PROCESSING", `Claimed by ${runnerId}`);
  return toJob(row);
}

/**
 * Advances a job one stage.
 *
 * Rejects an illegal jump rather than accepting it, so the recorded history of
 * a run always reflects work that actually happened.
 */
export async function transition(
  jobId: string,
  to: ExtractionJobState,
  options?: { note?: string; error?: string; reviewReason?: string },
): Promise<ExtractionJob> {
  const sql = getSql();

  return sql.begin(async (tx) => {
    const [current] = await tx<Pick<JobRow, "state">[]>`
      select state from extraction_jobs where id = ${jobId} for update
    `;
    if (!current) throw new Error(`Extraction job ${jobId} not found.`);
    if (!canTransition(current.state, to)) {
      throw new InvalidJobTransitionError(jobId, current.state, to);
    }

    const finishing = isTerminal(to);
    const [row] = await tx<JobRow[]>`
      update extraction_jobs
         set state         = ${to},
             progress      = ${STATE_PROGRESS[to]},
             error         = ${options?.error ?? null},
             review_reason = ${options?.reviewReason ?? null},
             finished_at   = ${finishing ? sql`now()` : null},
             duration_ms   = ${
               finishing
                 ? sql`(extract(epoch from (now() - coalesce(started_at, queued_at))) * 1000)::int`
                 : null
             }
       where id = ${jobId}
       returning *
    `;

    await tx`
      insert into extraction_job_events (job_id, from_state, to_state, note)
      values (${jobId}, ${current.state}, ${to}, ${options?.note ?? null})
    `;

    return toJob(row!);
  });
}

async function recordEvent(
  jobId: string,
  from: ExtractionJobState | null,
  to: ExtractionJobState,
  note?: string,
): Promise<void> {
  const sql = getSql();
  await sql`
    insert into extraction_job_events (job_id, from_state, to_state, note)
    values (${jobId}, ${from}, ${to}, ${note ?? null})
  `;
}

export async function getJob(jobId: string): Promise<ExtractionJob | null> {
  const sql = getSql();
  const [row] = await sql<JobRow[]>`select * from extraction_jobs where id = ${jobId}`;
  return row ? toJob(row) : null;
}

export async function listJobsForRfq(rfqId: string): Promise<ExtractionJob[]> {
  const sql = getSql();
  const rows = await sql<JobRow[]>`
    select * from extraction_jobs where rfq_id = ${rfqId} order by queued_at
  `;
  return rows.map(toJob);
}

export async function listEvents(jobId: string): Promise<ExtractionJobEvent[]> {
  const sql = getSql();
  const rows = await sql<
    { id: string; job_id: string; from_state: ExtractionJobState | null; to_state: ExtractionJobState; note: string | null; occurred_at: Date }[]
  >`
    select * from extraction_job_events where job_id = ${jobId} order by occurred_at
  `;
  return rows.map((r) => ({
    id: r.id,
    jobId: r.job_id,
    fromState: r.from_state,
    toState: r.to_state,
    note: r.note ?? undefined,
    occurredAt: r.occurred_at.toISOString(),
  }));
}

/** Re-queues a failed job. Explicit — nothing retries silently. */
export async function requeue(jobId: string): Promise<ExtractionJob> {
  return transition(jobId, "QUEUED", { note: "Re-queued after failure" });
}
