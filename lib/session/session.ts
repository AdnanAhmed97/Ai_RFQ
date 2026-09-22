import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/config/env";

/**
 * Prototype session handling (spec §5: "minimal prototype auth").
 *
 * An httpOnly, signed cookie carries an opaque session ID. The ID is the key
 * into the in-memory AI key store — the Anthropic key itself never enters the
 * cookie, so it cannot be read by the browser or replayed from a captured jar.
 *
 * Real authentication is explicitly out of scope (spec §67).
 */
export const SESSION_COOKIE = "rfx_session";

const MAX_AGE_SECONDS = 12 * 60 * 60;

function sign(value: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(value).digest("base64url");
}

function serialize(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`;
}

function verify(raw: string): string | null {
  const separator = raw.lastIndexOf(".");
  if (separator <= 0) return null;

  const sessionId = raw.slice(0, separator);
  const provided = Buffer.from(raw.slice(separator + 1));
  const expected = Buffer.from(sign(sessionId));

  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? sessionId : null;
}

export async function getSessionId(): Promise<string | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  return raw ? verify(raw) : null;
}

/** Issues a session if none exists. Returns the active session ID either way. */
export async function ensureSession(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  const verified = existing ? verify(existing) : null;
  if (verified) return verified;

  const sessionId = randomBytes(24).toString("base64url");
  store.set(SESSION_COOKIE, serialize(sessionId), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return sessionId;
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Exported for tests: signing round-trip without Next's cookie store. */
export const __sessionCrypto = { sign, serialize, verify };
