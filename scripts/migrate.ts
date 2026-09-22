/**
 * Applies SQL migrations in order, once each.
 *
 * Run with: npm run db:migrate
 * Add --reset to drop and rebuild the schema from scratch.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../supabase/migrations");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. See .env.example.");
  process.exit(1);
}

const reset = process.argv.includes("--reset");
const sql = postgres(databaseUrl, { max: 1 });

try {
  if (reset) {
    // Drops every table, type and function owned by the schema. The prototype
    // is meant to be rebuildable from nothing at any time.
    await sql.unsafe(`drop schema public cascade; create schema public;`);
    console.log("Schema dropped and recreated.");
  }

  await sql.unsafe(`
    create table if not exists schema_migrations (
      version    text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const applied = new Set(
    (await sql<{ version: string }[]>`select version from schema_migrations`).map(
      (r) => r.version,
    ),
  );

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip    ${file}`);
      continue;
    }
    const body = await readFile(path.join(migrationsDir, file), "utf8");
    // Each migration runs in one transaction: a partial schema is worse than none.
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (version) values (${file})`;
    });
    console.log(`  applied ${file}`);
    count += 1;
  }

  console.log(`\n${count} migration(s) applied, ${files.length} total.`);
} finally {
  await sql.end({ timeout: 5 });
}
