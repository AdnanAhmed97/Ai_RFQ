import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isDatabaseConfigured } from "@/lib/config/env";

/**
 * Server-side Supabase client.
 *
 * The prototype has no row-level security and no browser-side database access:
 * every read and write goes through a server route or server action using the
 * service-role key. The key must never reach the client bundle, which is why
 * this module is `server-only`.
 */
let cached: SupabaseClient | null = null;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
    this.name = "DatabaseNotConfiguredError";
  }
}

export function getDb(): SupabaseClient {
  if (!isDatabaseConfigured()) throw new DatabaseNotConfiguredError();
  if (cached) return cached;

  cached = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Null instead of throwing, for call sites that render a "not configured" state. */
export function tryGetDb(): SupabaseClient | null {
  return isDatabaseConfigured() ? getDb() : null;
}
