import "server-only";
import { getSql, isSqlConfigured } from "@/lib/db/sql";

/**
 * What the left rail shows.
 *
 * The roster is live: the buyer should be able to see coverage move without
 * leaving the screen they are on. Coverage is null until a document has been
 * read, and renders as an em dash rather than a zero.
 */
export interface RailVendor {
  id: string;
  shortLabel: string;
  quoted: number | null;
  expected: number | null;
  blockers: number;
}

export interface RailContext {
  rfqId: string;
  title: string;
  status: string;
  vendors: RailVendor[];
  openIssues: number;
  queued: number;
}

export async function loadRailContext(rfqId: string): Promise<RailContext | null> {
  if (!isSqlConfigured()) return null;
  const sql = getSql();

  const [rfq] = await sql<{ id: string; title: string; status: string }[]>`
    select id, title, status::text as status from rfqs where id = ${rfqId}
  `;
  if (!rfq) return null;

  const vendors = await sql<
    {
      id: string;
      short_label: string;
      quoted_line_count: number | null;
      expected_line_count: number | null;
      blockers: number;
    }[]
  >`
    select v.id, v.short_label, vr.quoted_line_count, vr.expected_line_count,
           (select count(*) from commercial_issues ci
             where ci.vendor_id = v.id and ci.severity = 'BLOCKER'
               and ci.resolved_at is null)::int as blockers
      from vendors v
      join vendor_responses vr on vr.vendor_id = v.id
     where v.rfq_id = ${rfqId}
     order by v.short_label
  `;

  const [totals] = await sql<{ issues: number; queued: number }[]>`
    select
      (select count(*) from commercial_issues
        where rfq_id = ${rfqId} and resolved_at is null)::int as issues,
      (select count(*) from extraction_jobs
        where rfq_id = ${rfqId} and state = 'QUEUED')::int as queued
  `;

  return {
    rfqId: rfq.id,
    title: rfq.title,
    status: rfq.status,
    openIssues: totals?.issues ?? 0,
    queued: totals?.queued ?? 0,
    vendors: vendors.map((v) => ({
      id: v.id,
      shortLabel: v.short_label,
      quoted: v.quoted_line_count,
      expected: v.expected_line_count,
      blockers: v.blockers,
    })),
  };
}
