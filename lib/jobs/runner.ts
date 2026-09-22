import "server-only";
import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db/sql";
import type { AIProvider } from "@/lib/ai/provider";
import { AIError } from "@/lib/ai/provider";
import { logAIOperation } from "@/lib/ai/observability";
import { ingestDocument } from "@/lib/documents/ingest";
import { loadRfxContext, type RfxContext } from "@/lib/extraction/context";
import { extractDocument } from "@/lib/extraction/extract";
import { matchLines } from "@/lib/extraction/match";
import { findMissingLines, validateExtraction } from "@/lib/extraction/validate";
import { persistExtraction, persistMissingLines } from "@/lib/extraction/persist";
import { claim, transition } from "./queue";
import type { ExtractionJob } from "./types";

/**
 * Runs extraction jobs.
 *
 * Each stage transition happens when that stage actually begins, so the
 * progress a buyer sees is a report of work done rather than an animation
 * (spec §62, Rule 9). A job that dies mid-run stops at the stage it reached.
 *
 * The runner is in-process. Everything above it reads job state from the
 * database, so moving this to a worker later changes nothing else.
 */

export interface RunnerResult {
  processed: number;
  completed: number;
  needsReview: number;
  failed: number;
}

/** Cached per run: the RFx catalogue is identical for every document. */
type ContextCache = Map<string, RfxContext>;

async function contextFor(cache: ContextCache, rfqId: string): Promise<RfxContext> {
  const existing = cache.get(rfqId);
  if (existing) return existing;
  const loaded = await loadRfxContext(rfqId);
  cache.set(rfqId, loaded);
  return loaded;
}

interface DocumentRow {
  document_id: string;
  filename: string;
  kind: string;
  storage_path: string;
  vendor_id: string;
  vendor_name: string;
  vendor_response_id: string;
}

async function loadDocument(documentId: string): Promise<DocumentRow> {
  const sql = getSql();
  const [row] = await sql<DocumentRow[]>`
    select d.id            as document_id,
           d.filename,
           d.kind::text    as kind,
           d.storage_path,
           v.id            as vendor_id,
           v.name          as vendor_name,
           vr.id           as vendor_response_id
      from documents d
      join vendor_responses vr on vr.id = d.vendor_response_id
      join vendors v           on v.id  = vr.vendor_id
     where d.id = ${documentId}
  `;
  if (!row) throw new Error(`Document ${documentId} not found.`);
  return row;
}

/** Processes one claimed job through the full pipeline. */
export async function runJob(
  job: ExtractionJob,
  provider: AIProvider,
  cache: ContextCache = new Map(),
): Promise<"COMPLETE" | "NEEDS_REVIEW" | "FAILED"> {
  const sql = getSql();
  const startedAt = Date.now();

  try {
    const context = await contextFor(cache, job.rfqId);
    const row = await loadDocument(job.documentId);

    // --- Read the file ---------------------------------------------------
    const document = await ingestDocument({
      documentId: row.document_id,
      filename: row.filename,
      storagePath: row.storage_path,
      kind: row.kind as never,
    });

    if (document.parsed) {
      // Cached so the file is opened from disk once, not per page view.
      await sql`
        update documents
           set parsed_content = ${sql.json(document.parsed.structure as never)},
               part_count     = ${document.parsed.partCount}
         where id = ${row.document_id}
      `;
    }

    // --- Extract -----------------------------------------------------------
    await transition(job.id, "EXTRACTING", { note: `Reading ${row.filename}` });

    const [runRow] = await sql<{ id: string }[]>`
      insert into extraction_runs (document_id, job_id, model, prompt_version, status, started_at)
      values (${row.document_id}, ${job.id}, ${provider.model}, 'pending', 'PROCESSING', now())
      returning id
    `;
    const extractionRunId = runRow!.id;

    const extraction = await extractDocument({ provider, context, document });

    await sql`
      update extraction_runs
         set prompt_version = ${extraction.promptVersion},
             input_tokens   = ${extraction.inputTokens},
             output_tokens  = ${extraction.outputTokens}
       where id = ${extractionRunId}
    `;

    // --- Match -------------------------------------------------------------
    await transition(job.id, "MATCHING", {
      note: `${extraction.extraction.quotes.length} quoted lines found`,
    });

    const matched = await matchLines({
      provider,
      context,
      extraction: extraction.extraction,
      vendorName: row.vendor_name,
    });

    // --- Validate ----------------------------------------------------------
    await transition(job.id, "VALIDATING");

    const validation = validateExtraction({
      context,
      extraction: extraction.extraction,
      matches: matched.matches,
    });

    await persistExtraction({
      sql,
      context,
      rfqId: job.rfqId,
      vendorId: row.vendor_id,
      documentId: row.document_id,
      extractionRunId,
      extraction: extraction.extraction,
      matches: matched.matches,
      issues: validation.issues,
    });

    await sql`
      update extraction_runs
         set status       = ${validation.needsReview ? "REVIEW_REQUIRED" : "COMPLETED"},
             completed_at = now(),
             duration_ms  = ${Date.now() - startedAt}
       where id = ${extractionRunId}
    `;

    await refreshVendorResponse(job.rfqId, row.vendor_id, row.vendor_response_id, context);

    const outcome = validation.needsReview ? "NEEDS_REVIEW" : "COMPLETE";
    await transition(job.id, outcome, {
      note: `${extraction.extraction.quotes.length} lines, ${validation.issues.length} issues`,
      reviewReason: validation.needsReview
        ? summariseReview(validation.issues.length, extraction.extraction.quotes.length)
        : undefined,
    });

    return outcome;
  } catch (error) {
    // The failure reason is an operator label, never a provider message body
    // and never anything read out of the document.
    const label =
      error instanceof AIError
        ? error.name
        : error instanceof Error
          ? error.message.slice(0, 200)
          : "unknown_error";

    // The label that reaches the database is deliberately terse. The operator
    // console gets the full picture — message, status and origin — because a
    // failure you cannot diagnose is a failure you cannot fix. No credential
    // and no document content passes through here.
    console.error("[extraction_job] failed", {
      documentId: job.documentId,
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      status: error instanceof AIError ? error.status : undefined,
      apiType: error instanceof AIError ? error.apiType : undefined,
      cause:
        error instanceof AIError && error.cause instanceof Error
          ? { name: error.cause.name, message: error.cause.message.slice(0, 500) }
          : undefined,
      at: error instanceof Error ? error.stack?.split("\n")[1]?.trim() : undefined,
    });

    logAIOperation({
      operation: "extraction_job",
      model: provider.model,
      status: "FAILED",
      durationMs: Date.now() - startedAt,
      error: label,
      rfqId: job.rfqId,
    });

    await transition(job.id, "FAILED", { error: label });
    return "FAILED";
  }
}

function summariseReview(issueCount: number, quoteCount: number): string {
  return `${quoteCount} lines extracted; ${issueCount} require review before award.`;
}

/**
 * Recomputes a supplier's coverage from what was actually extracted, and
 * records the lines they never quoted.
 */
async function refreshVendorResponse(
  rfqId: string,
  vendorId: string,
  vendorResponseId: string,
  context: RfxContext,
): Promise<void> {
  const sql = getSql();

  const rows = await sql<{ rfq_line_id: string }[]>`
    select distinct rfq_line_id from vendor_quotes
     where vendor_id = ${vendorId} and rfq_line_id is not null
  `;
  const quotedLineIds = new Set(rows.map((r) => r.rfq_line_id));

  await persistMissingLines({
    sql,
    rfqId,
    vendorId,
    issues: findMissingLines({ context, quotedLineIds }),
  });

  // Only set once documents have been read; never seeded ahead of the work.
  const [pending] = await sql<{ pending: number }[]>`
    select count(*)::int as pending from extraction_jobs
     where vendor_response_id = ${vendorResponseId}
       and state not in ('COMPLETE', 'NEEDS_REVIEW', 'FAILED')
  `;
  const [failed] = await sql<{ failed: number }[]>`
    select count(*)::int as failed from extraction_jobs
     where vendor_response_id = ${vendorResponseId} and state = 'FAILED'
  `;
  const [review] = await sql<{ review: number }[]>`
    select count(*)::int as review from extraction_jobs
     where vendor_response_id = ${vendorResponseId} and state = 'NEEDS_REVIEW'
  `;

  const status =
    (pending?.pending ?? 0) > 0
      ? "PROCESSING"
      : (failed?.failed ?? 0) > 0
        ? "PARTIAL"
        : (review?.review ?? 0) > 0
          ? "REVIEW_REQUIRED"
          : "COMPLETED";

  await sql`
    update vendor_responses
       set quoted_line_count = ${quotedLineIds.size},
           status            = ${status}
     where id = ${vendorResponseId}
  `;
}

/**
 * Drains the queue for one RFx.
 *
 * Documents are processed one at a time on purpose: five concurrent
 * document-sized requests is the fastest way to hit a rate limit on a personal
 * key, and a rate-limited half-run is worse than a slower whole one.
 */
export async function drainQueue(params: {
  provider: AIProvider;
  limit?: number;
}): Promise<RunnerResult> {
  const runnerId = `runner-${randomUUID().slice(0, 8)}`;
  const cache: ContextCache = new Map();
  const result: RunnerResult = { processed: 0, completed: 0, needsReview: 0, failed: 0 };
  const limit = params.limit ?? 50;

  for (let i = 0; i < limit; i++) {
    const job = await claim(runnerId);
    if (!job) break;

    const outcome = await runJob(job, params.provider, cache);
    result.processed += 1;
    if (outcome === "COMPLETE") result.completed += 1;
    else if (outcome === "NEEDS_REVIEW") result.needsReview += 1;
    else result.failed += 1;
  }

  return result;
}
