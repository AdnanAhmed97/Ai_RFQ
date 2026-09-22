import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Load .env.local so database-backed tests find DATABASE_URL. Tests that need a
// database skip visibly when it is absent rather than failing the suite.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No local env file — expected in CI and on a fresh clone.
}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Fixture generation and PDF parsing are slower than unit tests.
    testTimeout: 20_000,
    // Database-backed suites seed and assert against the same demo RFx, so they
    // must not run against it at the same time. The whole suite finishes in
    // under a second, so serialising files costs nothing.
    fileParallelism: false,
  },
});
