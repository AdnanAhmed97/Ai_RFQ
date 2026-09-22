import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { encryptCredential, decryptCredential } = await import("@/lib/ai/credential-cookie");

/**
 * The buyer's provider key travels in their own cookie, encrypted.
 *
 * Process memory could not hold it: a serverless deployment runs many
 * instances, so the lambda that accepted the key and the one rendering the next
 * page are different processes — the key vanished between them and the UI read
 * "connected, then not connected".
 */
describe("credential encryption", () => {
  const key = "sk-ant-api03-" + "x".repeat(95);

  it("round-trips a credential", () => {
    expect(decryptCredential(encryptCredential(key))).toBe(key);
  });

  it("never emits the credential in its payload", () => {
    const payload = encryptCredential(key);
    expect(payload).not.toContain(key);
    expect(payload).not.toContain("sk-ant");
    // base64url only — safe in a cookie without escaping.
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces a different payload every time for the same credential", () => {
    // A fresh IV per encryption; identical ciphertext would leak that two
    // sessions hold the same key.
    expect(encryptCredential(key)).not.toBe(encryptCredential(key));
  });

  it("rejects a tampered payload rather than returning partial plaintext", () => {
    const payload = encryptCredential(key);
    const tampered = payload.slice(0, -4) + (payload.endsWith("A") ? "BBBB" : "AAAA");
    expect(decryptCredential(tampered)).toBeNull();
  });

  it("rejects anything that is not a payload", () => {
    for (const junk of ["", "not-base64url!!", "AAAA", key]) {
      expect(decryptCredential(junk)).toBeNull();
    }
  });

  it("rejects a payload truncated below the authentication tag", () => {
    expect(decryptCredential(encryptCredential(key).slice(0, 8))).toBeNull();
  });
});
