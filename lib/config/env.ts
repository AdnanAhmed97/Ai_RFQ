import { z } from "zod";

/** The placeholder secret. Usable in development; refused when serving traffic. */
const DEV_SESSION_SECRET = "dev-only-insecure-session-secret";

/**
 * Environment configuration, validated once at module load.
 *
 * Supabase and Anthropic credentials are deliberately optional: the app shell
 * must boot and render an honest "not configured" state rather than crash on a
 * missing key. Features that need a credential check `isDatabaseConfigured()` /
 * the AI key store at call time.
 */

/**
 * An unset variable is not always `undefined`.
 *
 * Build platforms hand unset variables through as empty strings, and bundlers
 * statically replace `process.env.X` with `""` when no value exists. Zod's
 * `.default()` only fires on `undefined`, so without this every default is
 * bypassed and a build with no configuration fails on variables that have
 * perfectly good defaults.
 */
const blankAsAbsent = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema);

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  NEXT_PUBLIC_APP_URL: blankAsAbsent(z.string().url().default("http://localhost:3000")),

  // Signs the prototype session cookie. A weak default is allowed in dev only;
  // production boot fails below if it has not been replaced.
  SESSION_SECRET: blankAsAbsent(z.string().min(16).default(DEV_SESSION_SECRET)),

  // Model ID lives in config so it never goes stale inside the codebase.
  // Sonnet by default: this account does not have access to the Opus tier and
  // an Opus request comes back 400 rather than falling back.
  ANTHROPIC_MODEL: blankAsAbsent(z.string().min(1).default("claude-sonnet-5")),

  // Optional demo-mode key. BYOK is the primary path; this is the fallback
  // used only when DEMO_MODE_ENABLED is true and the buyer supplied no key.
  ANTHROPIC_API_KEY: blankAsAbsent(z.string().optional()),
  DEMO_MODE_ENABLED: blankAsAbsent(z.string().optional()).transform((v) => v === "true"),

  /**
   * Pooled Postgres connection, used at runtime.
   *
   * A serverless deployment must go through the pooler: a direct connection per
   * lambda exhausts Postgres under any real concurrency.
   */
  DATABASE_URL: blankAsAbsent(z.string().optional()),

  /**
   * Session-mode connection, used by migrations and seeding.
   *
   * Transaction-mode pgbouncer cannot hold the advisory locks and session state
   * that DDL needs. Falls back to DATABASE_URL where no pooler is involved.
   */
  DIRECT_DATABASE_URL: blankAsAbsent(z.string().optional()),

  SUPABASE_URL: blankAsAbsent(z.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: blankAsAbsent(z.string().optional()),
  SUPABASE_STORAGE_BUCKET: blankAsAbsent(z.string().default("vendor-documents")),

  // Prototype FX anchor. Fixed so award arithmetic is reproducible across runs;
  // labelled as non-market data everywhere it affects a number (spec §26).
  FX_USD_INR: blankAsAbsent(z.coerce.number().positive().default(84.5)),

  MAX_UPLOAD_MB: blankAsAbsent(z.coerce.number().positive().max(100).default(25)),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Vercel's Supabase integration prefixes everything it provisions, so
 * `airfq_POSTGRES_URL` arrives where `DATABASE_URL` is expected. Mapping the
 * integration's own names means a deployment works without anyone renaming
 * variables by hand — and a hand-set value still wins.
 */
function withIntegrationFallbacks(source: NodeJS.ProcessEnv): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...source };
  const blank = (value: unknown) => value === undefined || value === "";

  const integrationPrefix = Object.keys(source)
    .map((key) => /^(.+_)POSTGRES_URL$/.exec(key)?.[1])
    .find((prefix): prefix is string => Boolean(prefix));

  if (!integrationPrefix) return merged;

  const pick = (suffix: string) => source[`${integrationPrefix}${suffix}`];

  if (blank(merged.DATABASE_URL)) merged.DATABASE_URL = pick("POSTGRES_URL");
  if (blank(merged.DIRECT_DATABASE_URL)) {
    merged.DIRECT_DATABASE_URL = pick("POSTGRES_URL_NON_POOLING");
  }
  if (blank(merged.SUPABASE_URL)) merged.SUPABASE_URL = pick("SUPABASE_URL");
  if (blank(merged.SUPABASE_SERVICE_ROLE_KEY)) {
    merged.SUPABASE_SERVICE_ROLE_KEY = pick("SUPABASE_SERVICE_ROLE_KEY");
  }

  return merged;
}

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(withIntegrationFallbacks(process.env));

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }

  const env = parsed.data;

  // Deliberately NOT thrown here. A build runs with NODE_ENV=production and no
  // secrets configured, and failing at module load turns a missing runtime
  // variable into a broken build. The check belongs where the secret is used —
  // see assertSessionSecret(), called when a session is actually signed.
  return env;
}

export const env = loadEnv();

/** Exported for tests: validate an arbitrary object without touching process.env. */
export function parseEnv(input: Record<string, unknown>) {
  return EnvSchema.safeParse(input);
}

/**
 * Refuses to sign a session with the placeholder secret outside development.
 *
 * Enforced at use rather than at load: a build has no secrets and does not
 * serve traffic, so a missing value there is not yet a problem. Signing a real
 * session with a public constant is.
 */
export class SessionSecretMissingError extends Error {
  constructor() {
    super(
      "SESSION_SECRET is not set in this environment. Generate one with " +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"` " +
        "and set it, then redeploy.",
    );
    this.name = "SessionSecretMissingError";
  }
}

export function assertSessionSecret(): void {
  if (env.NODE_ENV === "production" && env.SESSION_SECRET === DEV_SESSION_SECRET) {
    throw new SessionSecretMissingError();
  }
}

/** True when a session can be issued. Checked before attempting to. */
export function isSessionConfigured(): boolean {
  return env.NODE_ENV !== "production" || env.SESSION_SECRET !== DEV_SESSION_SECRET;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(env.DATABASE_URL);
}

/** Supabase Storage holds uploaded vendor documents. Separate from the database. */
export function isStorageConfigured(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Demo mode requires an explicit opt-in AND a key from the environment.
 * A key is never hardcoded in source (spec §11).
 */
export function isDemoModeAvailable(): boolean {
  return env.DEMO_MODE_ENABLED && Boolean(env.ANTHROPIC_API_KEY);
}

export const MAX_UPLOAD_BYTES = env.MAX_UPLOAD_MB * 1024 * 1024;

/** Accepted vendor document types (spec §21). Enforced server-side on upload. */
export const ACCEPTED_UPLOAD_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // legacy .xls
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "image/jpeg",
  "image/png",
  "text/plain",
] as const;
