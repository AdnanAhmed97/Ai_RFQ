import "server-only";
import postgres, { type Sql } from "postgres";
import { env } from "@/lib/config/env";

/**
 * Direct Postgres access.
 *
 * Supabase Postgres speaks plain Postgres over its connection string, so going
 * direct rather than through PostgREST means the same code runs against a
 * hosted Supabase project and a local container. Migrations, seeding and
 * transactional writes all need real SQL anyway; the Supabase client is kept
 * only for Storage.
 *
 * Server-only: the connection string is a credential.
 */
let cached: Sql | null = null;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "DATABASE_URL is not set. Point it at a Supabase project's connection string, " +
        "or at a local Postgres, then apply supabase/migrations.",
    );
    this.name = "DatabaseNotConfiguredError";
  }
}

export function isSqlConfigured(): boolean {
  return Boolean(env.DATABASE_URL);
}

export function getSql(): Sql {
  if (!env.DATABASE_URL) throw new DatabaseNotConfiguredError();
  if (cached) return cached;

  cached = postgres(env.DATABASE_URL, {
    max: 8,
    idle_timeout: 20,
    // Numerics must not silently become floats: money is summed downstream.
    types: {
      numeric: {
        to: 1700,
        from: [1700],
        serialize: (value: number | string) => String(value),
        parse: (value: string) => Number(value),
      },
    },
  });
  return cached;
}

export async function closeSql(): Promise<void> {
  if (cached) {
    await cached.end({ timeout: 5 });
    cached = null;
  }
}
