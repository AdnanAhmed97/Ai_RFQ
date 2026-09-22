import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { testDatabaseUrl } from "./support/test-database";

import { seedDemoData, verifyFixtureFiles } from "@/fixtures/seed";
import { VENDOR_KEYS, VENDOR_PROFILES } from "@/fixtures/vendors/profiles";
import { EXPECTED_DOCUMENTS } from "@/fixtures/generate";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");
const DATABASE_URL = testDatabaseUrl();

/**
 * Exercises the real schema. Skipped when no database is configured, so the
 * suite stays runnable on a machine without one — but the skip is visible
 * rather than silent.
 */
const describeDb = DATABASE_URL ? describe : describe.skip;

/** First row of a query that is known to return exactly one. */
function only<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (!row) throw new Error(`Expected one row for ${what}, got none.`);
  return row;
}

describeDb("seeded database", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = postgres(DATABASE_URL!, { max: 2 });
    await seedDemoData(sql, FIXTURES);
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("holds exactly one demo RFx with 30 line items", async () => {
    const [rfq] = await sql<{ id: string; status: string }[]>`
      select id, status from rfqs where title = 'Corrugated Packaging — FY27'
    `;
    expect(rfq).toBeDefined();

    const { count } = only(
      await sql<{ count: number }[]>`
        select count(*)::int from rfq_line_items where rfq_id = ${rfq!.id}
      `,
      "line item count",
    );
    expect(count).toBe(30);
  });

  it("numbers line item positions 1..30 with no gaps", async () => {
    const rows = await sql<{ position: number }[]>`
      select position from rfq_line_items
      join rfqs on rfqs.id = rfq_line_items.rfq_id
      where rfqs.title = 'Corrugated Packaging — FY27'
      order by position
    `;
    expect(rows.map((r) => r.position)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("holds exactly 5 vendors, each with one response", async () => {
    const { vendors } = only(
      await sql<{ vendors: number }[]>`select count(*)::int as vendors from vendors`,
      "vendor count",
    );
    const { responses } = only(
      await sql<{ responses: number }[]>`select count(*)::int as responses from vendor_responses`,
      "response count",
    );
    expect(vendors).toBe(5);
    expect(responses).toBe(5);
  });

  it("registers every vendor's document set in the right format", async () => {
    for (const key of VENDOR_KEYS) {
      const rows = await sql<{ filename: string; kind: string }[]>`
        select d.filename, d.kind::text as kind
        from documents d
        join vendor_responses vr on vr.id = d.vendor_response_id
        join vendors v on v.id = vr.vendor_id
        where v.short_label = ${VENDOR_PROFILES[key].shortLabel}
        order by d.filename
      `;
      const expected = EXPECTED_DOCUMENTS[key].map((p) => p.split("/").pop()!).sort();
      expect(rows.map((r) => r.filename).sort(), key).toEqual(expected);
      for (const row of rows) expect(row.kind, `${key} ${row.filename}`).toBeTruthy();
    }
  });

  it("records a non-zero byte size for every document, so none is a stub", async () => {
    const rows = await sql<{ filename: string; byte_size: string }[]>`
      select filename, byte_size from documents
    `;
    expect(rows).toHaveLength(12);
    for (const row of rows) expect(Number(row.byte_size), row.filename).toBeGreaterThan(500);
  });

  it("queues one extraction job per document, all QUEUED", async () => {
    const rows = await sql<{ state: string; count: number }[]>`
      select state::text as state, count(*)::int as count from extraction_jobs group by state
    `;
    expect(rows).toEqual([{ state: "QUEUED", count: 12 }]);
  });

  it("seeds NO commercial data — prices must come from extraction, not from here", async () => {
    // This is the load-bearing assertion of the whole slice. If any of these
    // are non-zero, the demo's numbers did not come from reading a document.
    const counts = only(
      await sql<
        { quotes: number; truth: number; answers: number; evidence: number; issues: number; scenarios: number }[]
      >`
        select
          (select count(*) from vendor_quotes)::int          as quotes,
          (select count(*) from commercial_truth)::int       as truth,
          (select count(*) from questionnaire_answers)::int  as answers,
          (select count(*) from evidence)::int               as evidence,
          (select count(*) from commercial_issues)::int      as issues,
          (select count(*) from award_scenarios)::int        as scenarios
      `,
      "commercial data counts",
    );

    expect(counts).toEqual({
      quotes: 0,
      truth: 0,
      answers: 0,
      evidence: 0,
      issues: 0,
      scenarios: 0,
    });
  });

  it("leaves quoted_line_count null — coverage is an extraction finding", async () => {
    const rows = await sql<{ quoted_line_count: number | null }[]>`
      select quoted_line_count from vendor_responses
    `;
    expect(rows.every((r) => r.quoted_line_count === null)).toBe(true);
  });

  it("enforces referential integrity end to end", async () => {
    const { orphans } = only(
      await sql<{ orphans: number }[]>`
      select count(*)::int as orphans from (
        select 1 from documents d
          left join vendor_responses vr on vr.id = d.vendor_response_id
          where vr.id is null
        union all
        select 1 from vendor_responses vr
          left join vendors v on v.id = vr.vendor_id where v.id is null
        union all
        select 1 from extraction_jobs j
          left join documents d on d.id = j.document_id where d.id is null
        union all
        select 1 from rfq_line_items li
          left join rfqs r on r.id = li.rfq_id where r.id is null
        ) as orphan_rows
      `,
      "orphan count",
    );
    expect(orphans).toBe(0);
  });

  it("cascades a delete of the RFx through every dependent table", async () => {
    // Reseeding has to be safe. Verified on a throwaway copy so the seeded
    // dataset this suite shares is left intact.
    const [probe] = await sql<{ id: string }[]>`
      insert into rfqs (owner_id, title, category)
      select owner_id, 'Cascade probe', 'probe' from rfqs
      where title = 'Corrugated Packaging — FY27' limit 1
      returning id
    `;
    const [vendor] = await sql<{ id: string }[]>`
      insert into vendors (rfq_id, name, short_label)
      values (${probe!.id}, 'Probe Vendor', 'Probe') returning id
    `;
    const [response] = await sql<{ id: string }[]>`
      insert into vendor_responses (rfq_id, vendor_id) values (${probe!.id}, ${vendor!.id}) returning id
    `;
    await sql`
      insert into documents (vendor_response_id, filename, kind, mime_type, byte_size, storage_path)
      values (${response!.id}, 'probe.pdf', 'PDF', 'application/pdf', 1, 'probe.pdf')
    `;

    await sql`delete from rfqs where id = ${probe!.id}`;

    const { leftover } = only(
      await sql<{ leftover: number }[]>`
        select (
          (select count(*) from vendors where rfq_id = ${probe!.id}) +
          (select count(*) from vendor_responses where rfq_id = ${probe!.id})
        )::int as leftover
      `,
      "cascade leftovers",
    );
    expect(leftover).toBe(0);
  });

  it("reseeds deterministically — same counts, no duplicates", async () => {
    const first = await seedDemoData(sql, FIXTURES);
    const second = await seedDemoData(sql, FIXTURES);

    expect(second.lineItemCount).toBe(first.lineItemCount);
    expect(second.vendorCount).toBe(first.vendorCount);
    expect(second.documentCount).toBe(first.documentCount);
    expect(second.jobCount).toBe(first.jobCount);

    const totals = only(
      await sql<{ rfqs: number; vendors: number; documents: number }[]>`
        select
          (select count(*) from rfqs where title = 'Corrugated Packaging — FY27')::int as rfqs,
          (select count(*) from vendors)::int    as vendors,
          (select count(*) from documents)::int  as documents
      `,
      "reseed totals",
    );
    const { rfqs, vendors, documents } = totals;

    expect(rfqs).toBe(1);
    expect(vendors).toBe(5);
    expect(documents).toBe(12);
  });
});

describe("fixture files", () => {
  it("all exist and are readable", async () => {
    expect(await verifyFixtureFiles(FIXTURES)).toEqual([]);
  });
});
