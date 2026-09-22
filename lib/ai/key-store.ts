import "server-only";
import { env, isDemoModeAvailable } from "@/lib/config/env";

/**
 * Session-scoped store for the buyer's Anthropic key (BYOK, spec §5/§8).
 *
 * Prototype behaviour, stated plainly:
 *   * The key lives in this process's memory only. It is never written to the
 *     database, never serialized into a cookie, and never returned to the
 *     browser after submission.
 *   * A server restart drops every key. Buyers reconnect from /settings.
 *   * Because it is in-process, this does not survive horizontal scaling. That
 *     is acceptable for a single-instance demo and is the documented limit.
 *
 * Production would replace this with a KMS-backed per-session secret.
 */
interface StoredKey {
  apiKey: string;
  connectedAt: number;
  lastUsedAt: number;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * The store is hung off globalThis rather than held in a module-level binding.
 *
 * Next evaluates a module once per compilation layer — a route handler and a
 * server component do not necessarily share an instance, and dev-mode hot
 * reloading discards module state entirely. A plain `const keys = new Map()`
 * therefore produces a store that a route can write to and a page cannot read,
 * which looks exactly like a session that silently dropped.
 */
const STORE_KEY = Symbol.for("rfx.ai.key-store");

type GlobalWithStore = typeof globalThis & {
  [STORE_KEY]?: Map<string, StoredKey>;
};

function store(): Map<string, StoredKey> {
  const holder = globalThis as GlobalWithStore;
  holder[STORE_KEY] ??= new Map<string, StoredKey>();
  return holder[STORE_KEY];
}

export function setSessionKey(sessionId: string, apiKey: string): void {
  const now = Date.now();
  store().set(sessionId, { apiKey, connectedAt: now, lastUsedAt: now });
}

export function clearSessionKey(sessionId: string): void {
  store().delete(sessionId);
}

/**
 * Resolves the key for a session, falling back to the environment key only
 * when demo mode is explicitly enabled.
 */
export function getSessionKey(sessionId: string | null): string | null {
  if (sessionId) {
    const stored = store().get(sessionId);
    if (stored) {
      if (Date.now() - stored.lastUsedAt > SESSION_TTL_MS) {
        store().delete(sessionId);
      } else {
        stored.lastUsedAt = Date.now();
        return stored.apiKey;
      }
    }
  }
  return isDemoModeAvailable() ? (env.ANTHROPIC_API_KEY ?? null) : null;
}

export type KeyOrigin = "SESSION" | "DEMO_ENV" | "NONE";

export function getKeyOrigin(sessionId: string | null): KeyOrigin {
  if (sessionId && store().has(sessionId)) return "SESSION";
  if (isDemoModeAvailable()) return "DEMO_ENV";
  return "NONE";
}

/** Connection state for the UI. Deliberately returns no fragment of the key. */
export interface AIConnectionStatus {
  connected: boolean;
  origin: KeyOrigin;
  model: string;
  connectedAt?: string;
  demoModeAvailable: boolean;
}

export function getConnectionStatus(sessionId: string | null): AIConnectionStatus {
  const origin = getKeyOrigin(sessionId);
  const stored = sessionId ? store().get(sessionId) : undefined;
  return {
    connected: origin !== "NONE",
    origin,
    model: env.ANTHROPIC_MODEL,
    connectedAt: stored ? new Date(stored.connectedAt).toISOString() : undefined,
    demoModeAvailable: isDemoModeAvailable(),
  };
}

/** Exported for tests only. */
export function __resetKeyStore(): void {
  store().clear();
}
