/**
 * Creates and migrates the test database.
 *
 * Run with: npm run db:test-setup
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../supabase/migrations");

const base = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!base) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const url = new URL(base);
const appDatabase = url.pathname.replace(/^\//, "");
const testDatabase = appDatabase.endsWith("_test") ? appDatabase : `${appDatabase}_test`;

// Connect to the maintenance database to issue CREATE DATABASE.
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), { max: 1 });

try {
  const [existing] = await admin`select 1 from pg_database where datname = ${testDatabase}`;
  if (!existing) {
    await admin.unsafe(`create database "${testDatabase}"`);
    console.log(`Created database ${testDatabase}.`);
  } else {
    console.log(`Database ${testDatabase} already exists.`);
  }
} finally {
  await admin.end({ timeout: 5 });
}

url.pathname = `/${testDatabase}`;
const sql = postgres(url.toString(), { max: 1 });

try {
  await sql.unsafe(`drop schema public cascade; create schema public;`);
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await sql.unsafe(await readFile(path.join(migrationsDir, file), "utf8"));
    console.log(`  applied ${file}`);
  }
  console.log(`\nTest database ready: ${testDatabase}`);
} finally {
  await sql.end({ timeout: 5 });
}
