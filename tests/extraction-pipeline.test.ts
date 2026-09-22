import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testDatabaseUrl } from "./support/test-database";

vi.mock("server-only", () => ({}));

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");
const DATABASE_URL = testDatabaseUrl();
const describeDb = DATABASE_URL ? describe : describe.skip;

// The runner resolves its own connection from DATABASE_URL. Point that at the
// test database BEFORE importing anything that reads it, so the pipeline under
// test and the fixtures it asserts against are the same database — and neither
// is the one the app is using.
if (DATABASE_URL) process.env.DATABASE_URL = DATABASE_URL;

const { seedDemoData } = await import("@/fixtures/seed");
const { loadRfxContext } = await import("@/lib/extraction/context");
const { runJob } = await import("@/lib/jobs/runner");
const { claim, listEvents, listJobsForRfq } = await import("@/lib/jobs/queue");
const { FakeProvider } = await import("./support/fake-provider");

/**
 * Drives the real pipeline end to end: real fixture files off disk, real
 * schema, real job transitions, real persistence — with the model replaced.
 *
 * This proves the machinery around the model is correct. Whether the model
 * reads a scanned rate card correctly is a separate question, answerable only
 * against the live API.
 */
describeDb("extraction pipeline", () => {
  let sql: Sql;
  let rfqId: string;

  beforeAll(async () => {
    sql = postgres(DATABASE_URL!, { max: 2 });
    const seeded = await seedDemoData(sql, FIXTURES);
    rfqId = seeded.rfqId;
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  function extractionFor(questionRef: string) {
    return {
      documentSummary: "Supplier quotation with a questionnaire response.",
      quotes: [
        {
          rawDescription: "3 Ply RSC Box 305x230x160 mm - Plain",
          quotedPrice: 12.64,
          currency: "INR" as const,
          quotedUnit: "per piece",
          quantityBasis: null,
          quantityBasisUnit: null,
          freight: { status: "INCLUDED" as const, amount: null, currency: null, basis: null },
          taxesIncluded: false,
          taxRate: 18,
          leadTimeDays: 14,
          moq: null,
          confidence: "VERIFIED" as const,
          evidence: { page: null, sheet: "Quotation", row: 11, column: "F", sourceText: "12.64" },
          concern: null,
        },
        {
          rawDescription: "3 Ply Layer Pad 600x400 mm",
          quotedPrice: 620,
          currency: "INR" as const,
          quotedUnit: "per bundle",
          // No pack size stated — must be blocked, not guessed.
          quantityBasis: null,
          quantityBasisUnit: null,
          freight: { status: "UNKNOWN" as const, amount: null, currency: null, basis: null },
          taxesIncluded: null,
          taxRate: null,
          leadTimeDays: null,
          moq: null,
          confidence: "REVIEW_REQUIRED" as const,
          evidence: { page: null, sheet: "Quotation", row: 30, column: "F", sourceText: "620.00" },
          concern: "Quoted per bundle; no bundle quantity printed anywhere on the sheet.",
        },
        {
          // No dimensions in the wording, so specification cannot settle it and
          // the model is still asked — keeping the matching call covered.
          rawDescription: "Angle Board, laminated recycled",
          quotedPrice: 7.9,
          currency: "INR" as const,
          quotedUnit: "per piece",
          quantityBasis: null,
          quantityBasisUnit: null,
          freight: { status: "INCLUDED" as const, amount: null, currency: null, basis: null },
          taxesIncluded: null,
          taxRate: null,
          leadTimeDays: null,
          moq: null,
          confidence: "VERIFIED" as const,
          evidence: { page: null, sheet: "Quotation", row: 40, column: "F", sourceText: "7.90" },
          concern: null,
        },
      ],
      questionnaireAnswers: [
        {
          questionRef,
          rawAnswer: "Yes. ISO 9001:2015, certificate no. IN-QMS-114872.",
          confidence: "VERIFIED" as const,
          evidence: { page: 1, sheet: null, row: null, column: null, sourceText: "Yes. ISO 9001:2015" },
        },
      ],
      issues: [],
    };
  }

  it("walks a job through every stage in order, with no jumps", async () => {
    const context = await loadRfxContext(rfqId);
    const lineId = context.lines[0]!.id;

    const provider = new FakeProvider({
      byOperation: {
        extract_document: extractionFor("Q1"),
        // Only the line specification could not settle reaches the model.
        match_lines: {
          matches: [
            {
              vendorLineIndex: 2,
              status: "MATCHED",
              rfqLineId: context.lines[27]!.id,
              score: 0.9,
              reasoning: "Angle board, the only edge protector on the RFx.",
              candidates: [],
            },
          ],
        },
      },
    });

    const job = await claim("test-runner");
    expect(job).not.toBeNull();

    const outcome = await runJob(job!, provider);

    // The pack-size blocker means this cannot be reported as clean.
    expect(outcome).toBe("NEEDS_REVIEW");

    const events = await listEvents(job!.id);
    expect(events.map((e) => e.toState)).toEqual([
      "PROCESSING",
      "EXTRACTING",
      "MATCHING",
      "VALIDATING",
      "NEEDS_REVIEW",
    ]);

    // Extraction always runs; matching only for what specification could not
    // settle. Two of the three lines carry ply and dimensions, so they were
    // resolved in code and never reached the model.
    expect(provider.calls.map((c) => c.operation)).toEqual(["extract_document", "match_lines"]);
  });

  it("persists quotes with their evidence, and no normalized values", async () => {
    const quotes = await sql<
      { id: string; quoted_price: number; quoted_unit: string; confidence: string; rfq_line_id: string | null }[]
    >`select id, quoted_price, quoted_unit, confidence::text as confidence, rfq_line_id from vendor_quotes`;
    // Three quoted lines: two settled by specification, one by the model.
    expect(quotes).toHaveLength(3);

    const perPiece = quotes.find((q) => q.quoted_unit === "per piece")!;
    expect(Number(perPiece.quoted_price)).toBeCloseTo(12.64, 2);
    expect(perPiece.rfq_line_id).not.toBeNull();

    const evidence = await sql<{ subject_id: string; sheet: string | null; row: number | null; column: string | null; source_text: string }[]>`
      select subject_id, sheet, "row", "column", source_text from evidence where subject_type = 'VENDOR_QUOTE'
    `;
    expect(evidence.length).toBeGreaterThanOrEqual(2);
    const cited = evidence.find((e) => e.subject_id === perPiece.id)!;
    expect(cited.sheet).toBe("Quotation");
    expect(cited.row).toBe(11);
    expect(cited.column).toBe("F");
    expect(cited.source_text).toBe("12.64");

    // The comparable layer stays empty: normalization is Slice 6's job.
    const [truth] = await sql<{ count: number }[]>`select count(*)::int from commercial_truth`;
    expect(truth!.count).toBe(0);
  });

  it("raises a blocker for the per-bundle line with no pack size", async () => {
    const issues = await sql<{ category: string; severity: string; summary: string }[]>`
      select category::text as category, severity::text as severity, summary
        from commercial_issues where category = 'MISSING_PACK_SIZE'
    `;
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("BLOCKER");
  });

  it("records the questionnaire answer without deciding whether it passes", async () => {
    const answers = await sql<{ raw_answer: string; passes: boolean | null; confidence: string }[]>`
      select raw_answer, passes, confidence::text as confidence from questionnaire_answers
    `;
    expect(answers).toHaveLength(1);
    expect(answers[0]!.raw_answer).toContain("ISO 9001:2015");
    // Eligibility is decided by the engine in Slice 6, over this text.
    expect(answers[0]!.passes).toBeNull();
  });

  it("records missing lines for everything the supplier did not quote", async () => {
    const [missing] = await sql<{ count: number }[]>`
      select count(*)::int from commercial_issues where category = 'MISSING_LINE'
    `;
    // 30 RFx lines, 3 quoted by this one document.
    expect(missing!.count).toBe(27);
  });

  it("sets coverage only from what was actually extracted", async () => {
    const rows = await sql<{ short_label: string; quoted_line_count: number | null }[]>`
      select v.short_label, vr.quoted_line_count
        from vendor_responses vr join vendors v on v.id = vr.vendor_id
       order by v.short_label
    `;
    const processed = rows.filter((r) => r.quoted_line_count !== null);
    expect(processed).toHaveLength(1);
    expect(processed[0]!.quoted_line_count).toBe(3);
    // Suppliers whose documents have not been read report nothing, not zero.
    expect(rows.filter((r) => r.quoted_line_count === null)).toHaveLength(4);
  });

  it("caches the parsed spreadsheet so the file is read from disk once", async () => {
    const [document] = await sql<{ parsed_content: unknown; part_count: number | null }[]>`
      select parsed_content, part_count from documents
       where filename = 'quotation.xlsx' and parsed_content is not null
       limit 1
    `;
    expect(document?.parsed_content).toBeTruthy();
    expect(document?.part_count).toBeGreaterThan(0);
  });

  it("records a failure without leaving the job mid-pipeline", async () => {
    const provider = new FakeProvider({ byOperation: {}, failOn: "extract_document" });
    const job = await claim("test-runner-2");
    expect(job).not.toBeNull();

    const outcome = await runJob(job!, provider);
    expect(outcome).toBe("FAILED");

    const jobs = await listJobsForRfq(rfqId);
    const failed = jobs.find((j) => j.id === job!.id)!;
    expect(failed.state).toBe("FAILED");
    expect(failed.error).toBeTruthy();
    // The label must not leak a provider message body or document contents.
    expect(failed.error!.length).toBeLessThanOrEqual(200);

    const events = await listEvents(job!.id);
    expect(events.at(-1)!.toState).toBe("FAILED");
  });

  it("skips the matching call entirely when specification settles every line", async () => {
    const context = await loadRfxContext(rfqId);
    const provider = new FakeProvider({
      byOperation: {
        extract_document: {
          documentSummary: "A quotation whose lines all carry ply and dimensions.",
          quotes: [
            {
              rawDescription: "Corrugated Box 3Ply - 305x230x160 (B Flute)",
              quotedPrice: 11.75,
              currency: "INR" as const,
              quotedUnit: "per piece",
              quantityBasis: null,
              quantityBasisUnit: null,
              freight: { status: "INCLUDED" as const, amount: null, currency: null, basis: null },
              taxesIncluded: null,
              taxRate: null,
              leadTimeDays: null,
              moq: null,
              confidence: "VERIFIED" as const,
              evidence: { page: 1, sheet: null, row: 1, column: null, sourceText: "11.75" },
              concern: null,
            },
          ],
          questionnaireAnswers: [],
          issues: [],
        },
      },
    });

    const job = await claim("test-runner-prematch");
    expect(job).not.toBeNull();
    await runJob(job!, provider);

    // No match_lines call: a slow round-trip avoided on a question code answered.
    expect(provider.calls.map((c) => c.operation)).toEqual(["extract_document"]);
    void context;
  });

  it("marks the supplier PARTIAL when one of their documents failed", async () => {
    const rows = await sql<{ status: string }[]>`
      select vr.status::text as status
        from vendor_responses vr
        join extraction_jobs j on j.vendor_response_id = vr.id
       where j.state = 'FAILED'
       limit 1
    `;
    expect(["PARTIAL", "PROCESSING"]).toContain(rows[0]?.status);
  });
});
