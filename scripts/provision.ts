/**
 * Provisions a deployment from nothing.
 *
 * Run with: npm run provision
 *
 * Applies migrations, creates the storage bucket, uploads the fixture
 * documents, and seeds the demo dataset — in that order, because each step
 * depends on the one before. Safe to re-run: every step is idempotent.
 *
 * No model is called. Prices, matches and verdicts are extraction outputs, and
 * seeding them would mean the demo's numbers came from a fixture file rather
 * than from reading a document.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const migrationsDir = path.join(root, "supabase/migrations");
const fixturesDir = path.join(root, "fixtures");

// DDL needs session mode; transaction-mode pgbouncer cannot hold its locks.
const databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "vendor-documents";

if (!databaseUrl) {
  console.error(
    "DATABASE_URL is not set.\n" +
      "Supabase gives you one under Project Settings > Database > Connection string > URI.\n" +
      "Use the pooled connection for a serverless deployment.",
  );
  process.exit(1);
}

const step = (n: number, label: string) => console.log(`\n[${n}/4] ${label}`);

// --- 1. Migrations ---------------------------------------------------------
step(1, "Applying migrations");
const sql = postgres(databaseUrl, { max: 1 });

try {
  await sql.unsafe(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    );
  `);
  const applied = new Set(
    (await sql<{ version: string }[]>`select version from schema_migrations`).map((r) => r.version),
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`      skip    ${file}`);
      continue;
    }
    const body = await readFile(path.join(migrationsDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (version) values (${file})`;
    });
    console.log(`      applied ${file}`);
  }

  // --- 2 & 3. Storage ------------------------------------------------------
  if (supabaseUrl && serviceKey) {
    step(2, "Creating the storage bucket");
    const client = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: existing } = await client.storage.getBucket(bucket);
    if (existing) {
      console.log(`      ${bucket} already exists`);
    } else {
      // Private: supplier pricing is commercially sensitive.
      const { error } = await client.storage.createBucket(bucket, { public: false });
      if (error) throw new Error(error.message);
      console.log(`      created ${bucket} (private)`);
    }

    step(3, "Uploading fixture documents");
    const manifest = JSON.parse(
      await readFile(path.join(fixturesDir, "manifest.json"), "utf8"),
    ) as { documents: { relativePath: string; mimeType: string }[] };

    for (const document of manifest.documents) {
      const body = await readFile(path.join(fixturesDir, document.relativePath));
      const { error } = await client.storage
        .from(bucket)
        .upload(document.relativePath, body, {
          contentType: document.mimeType,
          upsert: true,
        });
      if (error) throw new Error(`${document.relativePath}: ${error.message}`);
      console.log(`      ${document.relativePath}`);
    }
  } else {
    step(2, "Skipping storage — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
    console.log("      Documents will be read from the repository's fixtures/ directory.");
    step(3, "Skipping upload");
  }

  // --- 4. Seed -------------------------------------------------------------
  // Seeding deletes and rebuilds the RFx, taking every extracted quote with it.
  // Re-running provision on a working instance must not silently destroy a run
  // that took fifteen minutes of model calls to produce.
  const [existing] = await sql<{ quotes: number }[]>`
    select count(*)::int as quotes from vendor_quotes
  `;
  const force = process.argv.includes("--force");

  if ((existing?.quotes ?? 0) > 0 && !force) {
    step(4, "Skipping seed — extracted data is already present");
    console.log(
      `      ${existing!.quotes} extracted quotes would be destroyed by reseeding.\n` +
        "      Re-run with --force to rebuild the dataset from scratch.",
    );
    console.log("\nProvisioned. The existing dataset is untouched.");
    process.exit(0);
  }

  step(4, "Seeding the demo dataset");
  const { seedDemoData } = await import("../fixtures/seed");
  const result = await seedDemoData(sql, fixturesDir);

  console.log(`      RFx           ${result.rfqId}`);
  console.log(`      Line items    ${result.lineItemCount}`);
  console.log(`      Suppliers     ${result.vendorCount}`);
  console.log(`      Documents     ${result.documentCount}`);
  console.log(`      Queued jobs   ${result.jobCount}`);

  console.log(
    "\nProvisioned. Nothing has been extracted — open Responses and run the pipeline\n" +
      "with your own Anthropic key to produce the commercial data.",
  );
} finally {
  await sql.end({ timeout: 5 });
}
