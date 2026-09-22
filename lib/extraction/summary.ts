import "server-only";
import { getSql } from "@/lib/db/sql";
import type { ExtractionJobState } from "@/lib/jobs/types";

/**
 * What the responses screen shows.
 *
 * Every figure here is counted from extracted rows. Nothing is seeded, and a
 * count is absent until the work that produces it has run — "27 of 30 lines" is
 * only sayable once a document has been read.
 */

export interface VendorResponseSummary {
  vendorId: string;
  shortLabel: string;
  name: string;
  status: string;
  channel: string;
  receivedAt: string;
  expectedLineCount: number | null;
  quotedLineCount: number | null;
  documents: {
    id: string;
    filename: string;
    kind: string;
    byteSize: number;
    jobState: ExtractionJobState;
    jobProgress: number;
    reviewReason: string | null;
    error: string | null;
  }[];
  issueCount: number;
  blockerCount: number;
}

export interface RfxResponsesView {
  rfqId: string;
  title: string;
  lineItemCount: number;
  vendors: VendorResponseSummary[];
  queued: number;
  inFlight: number;
  failed: number;
  extractedQuoteCount: number;
  evidenceCount: number;
}

export async function loadResponsesView(rfqId: string): Promise<RfxResponsesView | null> {
  const sql = getSql();

  const [rfq] = await sql<{ id: string; title: string }[]>`
    select id, title from rfqs where id = ${rfqId}
  `;
  if (!rfq) return null;

  const [lineCount] = await sql<{ count: number }[]>`
    select count(*)::int from rfq_line_items where rfq_id = ${rfqId}
  `;

  const vendors = await sql<
    {
      vendor_id: string;
      short_label: string;
      name: string;
      status: string;
      channel: string;
      received_at: Date;
      expected_line_count: number | null;
      quoted_line_count: number | null;
    }[]
  >`
    select v.id as vendor_id, v.short_label, v.name,
           vr.status::text as status, vr.channel::text as channel, vr.received_at,
           vr.expected_line_count, vr.quoted_line_count
      from vendors v
      join vendor_responses vr on vr.vendor_id = v.id
     where v.rfq_id = ${rfqId}
     order by v.short_label
  `;

  const documents = await sql<
    {
      vendor_id: string;
      id: string;
      filename: string;
      kind: string;
      byte_size: string;
      state: ExtractionJobState;
      progress: number;
      review_reason: string | null;
      error: string | null;
    }[]
  >`
    select v.id as vendor_id, d.id, d.filename, d.kind::text as kind, d.byte_size,
           coalesce(j.state, 'QUEUED') as state, coalesce(j.progress, 0) as progress,
           j.review_reason, j.error
      from documents d
      join vendor_responses vr on vr.id = d.vendor_response_id
      join vendors v           on v.id = vr.vendor_id
      left join extraction_jobs j on j.document_id = d.id
     where v.rfq_id = ${rfqId}
     order by d.filename
  `;

  const issues = await sql<{ vendor_id: string; total: number; blockers: number }[]>`
    select vendor_id,
           count(*)::int as total,
           count(*) filter (where severity = 'BLOCKER')::int as blockers
      from commercial_issues
     where rfq_id = ${rfqId} and resolved_at is null
     group by vendor_id
  `;
  const issuesByVendor = new Map(issues.map((i) => [i.vendor_id, i]));

  const [totals] = await sql<
    { queued: number; in_flight: number; failed: number; quotes: number; evidence: number }[]
  >`
    select
      (select count(*) from extraction_jobs where rfq_id = ${rfqId} and state = 'QUEUED')::int as queued,
      (select count(*) from extraction_jobs where rfq_id = ${rfqId}
         and state in ('PROCESSING','EXTRACTING','MATCHING','VALIDATING'))::int as in_flight,
      (select count(*) from extraction_jobs where rfq_id = ${rfqId} and state = 'FAILED')::int as failed,
      (select count(*) from vendor_quotes where rfq_id = ${rfqId})::int as quotes,
      (select count(*) from evidence e
         join documents d on d.id = e.document_id
         join vendor_responses vr on vr.id = d.vendor_response_id
        where vr.rfq_id = ${rfqId})::int as evidence
  `;

  return {
    rfqId: rfq.id,
    title: rfq.title,
    lineItemCount: lineCount?.count ?? 0,
    queued: totals?.queued ?? 0,
    inFlight: totals?.in_flight ?? 0,
    failed: totals?.failed ?? 0,
    extractedQuoteCount: totals?.quotes ?? 0,
    evidenceCount: totals?.evidence ?? 0,
    vendors: vendors.map((vendor) => {
      const issue = issuesByVendor.get(vendor.vendor_id);
      return {
        vendorId: vendor.vendor_id,
        shortLabel: vendor.short_label,
        name: vendor.name,
        status: vendor.status,
        channel: vendor.channel,
        receivedAt: vendor.received_at.toISOString(),
        expectedLineCount: vendor.expected_line_count,
        quotedLineCount: vendor.quoted_line_count,
        issueCount: issue?.total ?? 0,
        blockerCount: issue?.blockers ?? 0,
        documents: documents
          .filter((d) => d.vendor_id === vendor.vendor_id)
          .map((d) => ({
            id: d.id,
            filename: d.filename,
            kind: d.kind,
            byteSize: Number(d.byte_size),
            jobState: d.state,
            jobProgress: d.progress,
            reviewReason: d.review_reason,
            error: d.error,
          })),
      };
    }),
  };
}

/** The most recent RFx, so the demo opens on something. */
export async function findLatestRfqId(): Promise<string | null> {
  const sql = getSql();
  const [row] = await sql<{ id: string }[]>`
    select id from rfqs order by created_at desc limit 1
  `;
  return row?.id ?? null;
}

export interface WorkspaceRfx {
  id: string;
  title: string;
  category: string;
  status: string;
  updatedAt: string;
  vendorCount: number;
  lineItemCount: number;
  documentCount: number;
  /** Null until extraction has run. Never shown as zero before then. */
  quotedValueInr: number | null;
  openIssueCount: number;
  queuedJobCount: number;
  processedDocumentCount: number;
}

/**
 * The workspace list.
 *
 * Quoted value stays null until the pricing engine exists — showing a rupee
 * total before anything has been normalized would be the fabricated headline
 * figure this product is built to avoid.
 */
export async function loadWorkspace(): Promise<WorkspaceRfx[]> {
  const sql = getSql();

  const rows = await sql<
    {
      id: string;
      title: string;
      category: string;
      status: string;
      updated_at: Date;
      vendor_count: number;
      line_item_count: number;
      document_count: number;
      open_issue_count: number;
      queued_job_count: number;
      processed_document_count: number;
    }[]
  >`
    select r.id, r.title, r.category, r.status::text as status, r.updated_at,
           (select count(*) from vendors v where v.rfq_id = r.id)::int            as vendor_count,
           (select count(*) from rfq_line_items li where li.rfq_id = r.id)::int   as line_item_count,
           (select count(*) from documents d
              join vendor_responses vr on vr.id = d.vendor_response_id
             where vr.rfq_id = r.id)::int                                          as document_count,
           (select count(*) from commercial_issues ci
             where ci.rfq_id = r.id and ci.resolved_at is null)::int               as open_issue_count,
           (select count(*) from extraction_jobs j
             where j.rfq_id = r.id and j.state = 'QUEUED')::int                    as queued_job_count,
           (select count(*) from extraction_jobs j
             where j.rfq_id = r.id and j.state in ('COMPLETE','NEEDS_REVIEW'))::int as processed_document_count
      from rfqs r
     order by r.updated_at desc
  `;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    status: row.status,
    updatedAt: row.updated_at.toISOString(),
    vendorCount: row.vendor_count,
    lineItemCount: row.line_item_count,
    documentCount: row.document_count,
    // Awaiting the pricing engine. Absent, not zero.
    quotedValueInr: null,
    openIssueCount: row.open_issue_count,
    queuedJobCount: row.queued_job_count,
    processedDocumentCount: row.processed_document_count,
  }));
}
