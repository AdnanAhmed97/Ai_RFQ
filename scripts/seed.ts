/**
 * Resets and reseeds the demo dataset.
 *
 * Run with: npm run db:seed
 *
 * Safe to run repeatedly — the demo RFx is deleted and rebuilt, and the
 * cascade takes every dependent row with it. No model is called.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

import { seedDemoData, verifyFixtureFiles } from "../fixtures/seed";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.resolve(here, "../fixtures");

const databaseUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. See .env.example.");
  process.exit(1);
}

const missing = await verifyFixtureFiles(fixturesRoot);
if (missing.length > 0) {
  console.error("Fixture documents missing or unreadable:");
  for (const file of missing) console.error(`  ${file}`);
  console.error("\nRun: npm run fixtures:generate");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const result = await seedDemoData(sql, fixturesRoot);
  console.log("Demo dataset seeded.\n");
  console.log(`  RFx            ${result.rfqId}`);
  console.log(`  Line items     ${result.lineItemCount}`);
  console.log(`  Questions      ${result.questionCount}`);
  console.log(`  Vendors        ${result.vendorCount}`);
  console.log(`  Documents      ${result.documentCount}`);
  console.log(`  Queued jobs    ${result.jobCount}`);
  console.log("\nNo extraction has run. Prices, matches and verdicts are absent by design.");
} finally {
  await sql.end({ timeout: 5 });
}
