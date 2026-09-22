import { beforeEach, describe, expect, it, vi } from "vitest";

// The key store is `server-only`; stub that marker so it can be unit-tested.
vi.mock("server-only", () => ({}));

const { __resetKeyStore, clearSessionKey, getConnectionStatus, getKeyOrigin, getSessionKey, setSessionKey } =
  await import("@/lib/ai/key-store");

describe("BYOK key store", () => {
  beforeEach(() => __resetKeyStore());

  it("returns a stored key only to the session that supplied it", () => {
    setSessionKey("session-a", "sk-ant-aaa");
    expect(getSessionKey("session-a")).toBe("sk-ant-aaa");
    expect(getSessionKey("session-b")).toBeNull();
  });

  it("reports no credential when nothing is stored and demo mode is off", () => {
    expect(getSessionKey(null)).toBeNull();
    expect(getKeyOrigin(null)).toBe("NONE");
  });

  it("forgets a key on disconnect", () => {
    setSessionKey("session-a", "sk-ant-aaa");
    clearSessionKey("session-a");
    expect(getSessionKey("session-a")).toBeNull();
  });

  it("never exposes the key, or any part of it, through connection status", () => {
    setSessionKey("session-a", "sk-ant-secret-value");
    const status = getConnectionStatus("session-a");
    expect(status.connected).toBe(true);
    expect(status.origin).toBe("SESSION");
    expect(JSON.stringify(status)).not.toContain("secret");
    expect(JSON.stringify(status)).not.toContain("sk-ant");
  });
});
