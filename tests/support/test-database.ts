import postgres, { type Sql } from "postgres";

/**
 * Database-backed tests run against their own database, never the one the app
 * is using.
 *
 * Seeding deletes and rebuilds the demo RFx. Pointed at the development
 * database that destroys whatever extraction run is in progress — which it did,
 * once, and cost a full run of twelve documents.
 */
export function testDatabaseUrl(): string | null {
  const configured = process.env.TEST_DATABASE_URL;
  if (configured) return configured;

  const base = process.env.DATABASE_URL;
  if (!base) return null;

  try {
    const url = new URL(base);
    const name = url.pathname.replace(/^\//, "");
    if (!name) return null;
    if (name.endsWith("_test")) return base;
    url.pathname = `/${name}_test`;
    return url.toString();
  } catch {
    return null;
  }
}

export function connectTestDatabase(): Sql {
  const url = testDatabaseUrl();
  if (!url) throw new Error("No test database configured.");
  return postgres(url, { max: 2 });
}
