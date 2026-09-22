import "server-only";
import { cookies } from "next/headers";
import { env, isDemoModeAvailable } from "@/lib/config/env";
import { CREDENTIAL_COOKIE, decryptCredential, encryptCredential } from "./credential-cookie";

/**
 * Where the buyer's provider key lives (BYOK, spec §5/§8).
 *
 * It lives in their own cookie, encrypted, and nowhere else. The server keeps
 * no copy — not in memory, not in the database — so there is no store to leak,
 * and every deployment instance can read it because it arrives with the request.
 *
 * Stated plainly, and shown on the settings screen:
 *   - the key is never persisted in plaintext anywhere
 *   - it is never readable by browser JavaScript
 *   - rotating SESSION_SECRET invalidates every outstanding credential
 */
const TTL_SECONDS = 12 * 60 * 60;

export async function setSessionKey(apiKey: string): Promise<void> {
  const store = await cookies();
  store.set(CREDENTIAL_COOKIE, encryptCredential(apiKey), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function clearSessionKey(): Promise<void> {
  (await cookies()).delete(CREDENTIAL_COOKIE);
}

/**
 * Resolves the key for this request.
 *
 * Falls back to the environment key only when demo mode is explicitly enabled;
 * a deployment without that opt-in has no credential of its own.
 */
export async function getSessionKey(): Promise<string | null> {
  const payload = (await cookies()).get(CREDENTIAL_COOKIE)?.value;
  if (payload) {
    const credential = decryptCredential(payload);
    if (credential) return credential;
    // Undecryptable: a rotated secret, or a cookie from another deployment.
    // Treated as absent rather than as an error the buyer can do nothing about.
  }
  return isDemoModeAvailable() ? (env.ANTHROPIC_API_KEY ?? null) : null;
}

export type KeyOrigin = "SESSION" | "DEMO_ENV" | "NONE";

export interface AIConnectionStatus {
  connected: boolean;
  origin: KeyOrigin;
  model: string;
  demoModeAvailable: boolean;
}

/** Connection state for the UI. Returns no fragment of the key itself. */
export async function getConnectionStatus(): Promise<AIConnectionStatus> {
  const payload = (await cookies()).get(CREDENTIAL_COOKIE)?.value;
  const fromCookie = payload ? decryptCredential(payload) : null;

  const origin: KeyOrigin = fromCookie
    ? "SESSION"
    : isDemoModeAvailable()
      ? "DEMO_ENV"
      : "NONE";

  return {
    connected: origin !== "NONE",
    origin,
    model: env.ANTHROPIC_MODEL,
    demoModeAvailable: isDemoModeAvailable(),
  };
}
