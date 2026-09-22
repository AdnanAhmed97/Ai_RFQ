/**
 * Regenerates every vendor fixture document from source data.
 *
 * Run with: npm run fixtures:generate
 *
 * Output is deterministic — re-running produces byte-identical files — so this
 * is safe to run whenever the underlying RFx or vendor data changes.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateAllFixtures } from "../fixtures/generate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

const manifest = await generateAllFixtures(root);

const byVendor = new Map<string, number>();
for (const doc of manifest.documents) {
  byVendor.set(doc.vendorKey, (byVendor.get(doc.vendorKey) ?? 0) + 1);
}

console.log(`Generated ${manifest.documents.length} documents into ${root}\n`);
for (const doc of manifest.documents) {
  console.log(`  ${doc.kind.padEnd(5)}  ${doc.relativePath.padEnd(48)}  ${doc.evidence.length} evidence records`);
}
console.log("");
for (const [vendor, count] of [...byVendor].sort()) {
  console.log(`  ${vendor}: ${count} documents`);
}
