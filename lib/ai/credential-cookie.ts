import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { env } from "@/lib/config/env";

/**
 * The buyer's provider key, encrypted into their own session cookie.
 *
 * Process memory cannot hold it. A serverless deployment runs many instances,
 * so the lambda that accepted the key and the lambda that renders the next page
 * are different processes — the key vanishes between the two, which reads to
 * the buyer as "connected, then not connected".
 *
 * The key therefore travels with the request, AES-256-GCM encrypted under a key
 * derived from SESSION_SECRET, in an httpOnly cookie. That keeps every promise
 * the product makes about it:
 *
 *   - never persisted in plaintext — the server stores nothing at all
 *   - never readable by browser JavaScript — httpOnly
 *   - never recoverable without the deployment's secret — rotating
 *     SESSION_SECRET invalidates every outstanding credential
 *
 * It is not a bearer token for anything of ours: the ciphertext is useless
 * without the server secret, and authenticated so it cannot be altered.
 */
export const CREDENTIAL_COOKIE = "rfx_ai_credential";

const ALGORITHM = "aes-256-gcm";
const SALT = "rfx-intelligence/credential/v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function encryptionKey(): Buffer {
  // Derived, not used directly: the session secret also signs session ids, and
  // one secret should not be two keys.
  return scryptSync(env.SESSION_SECRET, SALT, 32);
}

export function encryptCredential(credential: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(credential, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

/** Returns null for anything that does not decrypt and authenticate cleanly. */
export function decryptCredential(payload: string): string | null {
  try {
    const raw = Buffer.from(payload, "base64url");
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;

    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    const credential = plaintext.toString("utf8");
    return credential.length > 0 ? credential : null;
  } catch {
    // A wrong secret, a tampered payload or a truncated cookie all land here.
    // None of them is distinguishable to the caller, and none should be.
    return null;
  }
}

/** Exported for tests: confirms a round-trip without touching a cookie store. */
export const __credentialCrypto = {
  encryptCredential,
  decryptCredential,
  matches: (a: string, b: string) =>
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)),
};
