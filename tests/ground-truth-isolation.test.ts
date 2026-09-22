import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Directories that make up the running product. */
const PRODUCT_DIRECTORIES = ["app", "lib", "components", "types"];

async function sourceFiles(directory: string): Promise<string[]> {
  const absolute = path.join(ROOT, directory);
  const collected: string[] = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current)) {
      const full = path.join(current, entry);
      const info = await stat(full);
      if (info.isDirectory()) await walk(full);
      else if (/\.(ts|tsx|mjs|js)$/.test(entry)) collected.push(full);
    }
  }
  await walk(absolute);
  return collected;
}

/**
 * The single most important test in this slice.
 *
 * If the product could read the answer key, every extraction result and every
 * award figure would be unfalsifiable, and the demo would be exactly the fake
 * the specification prohibits (§53, Rule 7). This asserts the boundary rather
 * than trusting it.
 */
describe("ground truth is unreachable from the product", () => {
  it("is never imported by app, lib, components or types", async () => {
    const offenders: string[] = [];

    for (const directory of PRODUCT_DIRECTORIES) {
      for (const file of await sourceFiles(directory)) {
        const source = await readFile(file, "utf8");
        if (/ground-truth/.test(source)) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }

    expect(
      offenders,
      `These product files reference the ground-truth answer key:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("does not let the product import any fixture data at all", async () => {
    // Seeding is a script concern. If a page or a lib module pulled fixture
    // prices in directly, the demo would render seeded numbers rather than
    // extracted ones and nobody downstream would be able to tell.
    const offenders: string[] = [];

    for (const directory of PRODUCT_DIRECTORIES) {
      for (const file of await sourceFiles(directory)) {
        const source = await readFile(file, "utf8");
        if (/from\s+["'](@\/fixtures|\.\.?\/.*fixtures)/.test(source)) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }

    expect(
      offenders,
      `These product files import fixture data:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
