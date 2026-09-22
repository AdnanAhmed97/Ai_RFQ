import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/config/env";

describe("environment configuration", () => {
  it("boots with no variables set, so the shell can render a configuration state", () => {
    const result = parseEnv({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ANTHROPIC_MODEL).toBe("claude-sonnet-5");
      expect(result.data.FX_USD_INR).toBe(84.5);
      expect(result.data.DEMO_MODE_ENABLED).toBe(false);
    }
  });

  it("treats demo mode as opt-in: any value other than 'true' leaves it off", () => {
    expect(parseEnv({ DEMO_MODE_ENABLED: "1" })).toMatchObject({
      data: { DEMO_MODE_ENABLED: false },
    });
    expect(parseEnv({ DEMO_MODE_ENABLED: "true" })).toMatchObject({
      data: { DEMO_MODE_ENABLED: true },
    });
  });

  it("rejects a malformed Supabase URL rather than failing later at query time", () => {
    expect(parseEnv({ SUPABASE_URL: "not-a-url" }).success).toBe(false);
  });

  it("rejects a non-positive FX rate, which would silently zero out every conversion", () => {
    expect(parseEnv({ FX_USD_INR: "0" }).success).toBe(false);
    expect(parseEnv({ FX_USD_INR: "-1" }).success).toBe(false);
  });

  it("caps upload size so a large file cannot exhaust server memory", () => {
    expect(parseEnv({ MAX_UPLOAD_MB: "500" }).success).toBe(false);
  });
});

describe("platform-supplied blanks", () => {
  it("treats an empty string as absent, so defaults still apply", () => {
    // Build platforms hand unset variables through as empty strings, and
    // bundlers statically replace process.env.X with "". Zod's .default() only
    // fires on undefined, so without this every default is bypassed and a build
    // with no configuration fails on variables that have perfectly good ones.
    const result = parseEnv({
      NEXT_PUBLIC_APP_URL: "",
      SESSION_SECRET: "",
      ANTHROPIC_MODEL: "",
      FX_USD_INR: "",
      MAX_UPLOAD_MB: "",
      DATABASE_URL: "",
      SUPABASE_URL: "",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(result.data.ANTHROPIC_MODEL).toBe("claude-sonnet-5");
    expect(result.data.FX_USD_INR).toBe(84.5);
    expect(result.data.MAX_UPLOAD_MB).toBe(25);
    expect(result.data.SESSION_SECRET.length).toBeGreaterThanOrEqual(16);
  });

  it("still rejects a value that is present but wrong", () => {
    // Blank means absent; it does not mean "accept anything".
    expect(parseEnv({ FX_USD_INR: "0" }).success).toBe(false);
    expect(parseEnv({ SUPABASE_URL: "not-a-url" }).success).toBe(false);
  });
});
