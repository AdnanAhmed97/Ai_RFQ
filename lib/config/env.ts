import { z } from "zod";

/**
 * Environment configuration, validated once at module load.
 *
 * Supabase and Anthropic credentials are deliberately optional: the app shell
 * must boot and render an honest "not configured" state rather than crash on a
 * missing key. Features that need a credential check `isDatabaseConfigured()` /
 * the AI key store at call time.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  // Signs the prototype session cookie. A weak default is allowed in dev only;
  // production boot fails below if it has not been replaced.
  SESSION_SECRET: z.string().min(16).default("dev-only-insecure-session-secret"),

  // Model ID lives in config so it never goes stale inside the codebase.
  // Sonnet by default: this account does not have access to the Opus tier and
  // an Opus request comes back 400 rather than falling back.
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5"),

  // Optional demo-mode key. BYOK is the primary path; this is the fallback
  // used only when DEMO_MODE_ENABLED is true and the buyer supplied no key.
  ANTHROPIC_API_KEY: z.string().optional(),
  DEMO_MODE_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  // Direct Postgres connection. Supabase supplies one; a local container works
  // identically. This is what migrations, seeding and all reads/writes use.
  DATABASE_URL: z.string().optional().or(z.literal("")),

  SUPABASE_URL: z.string().url().optional().or(z.literal("")),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().or(z.literal("")),
  SUPABASE_STORAGE_BUCKET: z.string().default("vendor-documents"),

  // Prototype FX anchor. Fixed so award arithmetic is reproducible across runs;
  // labelled as non-market data everywhere it affects a number (spec §26).
  FX_USD_INR: z.coerce.number().positive().default(84.5),

  MAX_UPLOAD_MB: z.coerce.number().positive().max(100).default(25),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }

  const env = parsed.data;

  if (
    env.NODE_ENV === "production" &&
    env.SESSION_SECRET === "dev-only-insecure-session-secret"
  ) {
    throw new Error(
      "SESSION_SECRET must be set to a real value outside development.",
    );
  }

  return env;
}

export const env = loadEnv();

/** Exported for tests: validate an arbitrary object without touching process.env. */
export function parseEnv(input: Record<string, unknown>) {
  return EnvSchema.safeParse(input);
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
