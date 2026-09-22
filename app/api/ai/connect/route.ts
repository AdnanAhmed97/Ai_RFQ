import { NextResponse } from "next/server";
import { z } from "zod";
import { env, isDemoModeAvailable, isSessionConfigured } from "@/lib/config/env";
import { ensureSession } from "@/lib/session/session";
import { getProviderForKey } from "@/lib/ai/client";
import { setSessionKey, getConnectionStatus } from "@/lib/ai/key-store";
import { AIAuthenticationError, AIError, AIRateLimitError } from "@/lib/ai/provider";
import { describeCredential, explainShape } from "@/lib/ai/credential-shape";

export const runtime = "nodejs";

const BodySchema = z.union([
  z.object({ apiKey: z.string().min(1) }),
  z.object({ useDemoKey: z.literal(true) }),
]);

/**
 * Validates a provider credential with a real API round-trip, then stores it
 * server-side for the session.
 *
 * The key is never logged, never written to the database, and never returned in
 * the response — the only thing that leaves here is a boolean.
 */
export async function POST(request: Request) {
  // Checked before the model call, not after: validating a key and then failing
  // to store it wastes the round-trip and surfaces as an opaque 500.
  if (!isSessionConfigured()) {
    return NextResponse.json(
      {
        error:
          "This deployment has no SESSION_SECRET, so the credential cannot be held for your " +
          "session. Set SESSION_SECRET in the environment and redeploy.",
      },
      { status: 503 },
    );
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide an API key." }, { status: 400 });
  }

  let apiKey: string;
  let rawCredential = "";
  if ("useDemoKey" in parsed.data) {
    if (!isDemoModeAvailable()) {
      return NextResponse.json(
        { error: "Demo mode is not enabled on this deployment." },
        { status: 400 },
      );
    }
    apiKey = env.ANTHROPIC_API_KEY!;
  } else {
    rawCredential = parsed.data.apiKey;
    apiKey = rawCredential.trim();
  }

  try {
    // A real call. "Connected" must mean the model actually answered.
    await getProviderForKey(apiKey).verifyCredentials();
  } catch (error) {
    // Logged server-side with the status and provider error type — enough to
    // diagnose, and containing neither the key nor the request body.
    console.error(
      "[ai/connect] credential shape:",
      rawCredential ? describeCredential(rawCredential) : "(demo key from environment)",
    );
    console.error(
      "[ai/connect] verification failed:",
      error instanceof AIError
        ? { name: error.name, status: error.status, apiType: error.apiType, model: env.ANTHROPIC_MODEL }
        : { name: "unknown", model: env.ANTHROPIC_MODEL },
    );
    if (error instanceof AIAuthenticationError) {
      // Report what was actually received, so a truncated paste or the wrong
      // credential type is distinguishable from a genuinely dead key. Only
      // non-secret properties are echoed back.
      const shape = describeCredential(rawCredential);
      return NextResponse.json(
        {
          error: `Anthropic rejected that credential — ${explainShape(shape)}.`,
          shape,
        },
        { status: 401 },
      );
    }
    if (error instanceof AIRateLimitError) {
      return NextResponse.json(
        { error: "Anthropic rate-limited the test call. Try again shortly." },
        { status: 429 },
      );
    }
    if (error instanceof AIError) {
      // A model-shaped failure means the credential works but the configured id
      // does not. Rather than make the user guess, ask the API what it can use.
      if (error.status === 400 || error.status === 404) {
        try {
          const models = await getProviderForKey(apiKey).listModels();
          if (models.length > 0) {
            return NextResponse.json(
              {
                error:
                  `The credential works, but "${env.ANTHROPIC_MODEL}" is not available to it. ` +
                  `Set ANTHROPIC_MODEL in .env.local to one of: ${models.slice(0, 8).join(", ")}`,
                availableModels: models,
              },
              { status: 502 },
            );
          }
        } catch {
          // Fall through to the generic hint below.
        }
      }

      const hint =
        error.status === 404 || error.apiType === "not_found_error"
          ? `The key works, but this account cannot reach the model "${env.ANTHROPIC_MODEL}". Set ANTHROPIC_MODEL in .env.local to a model your account has access to.`
          : error.status === 403
            ? `The key was accepted but lacks permission for "${env.ANTHROPIC_MODEL}".`
            : error.status === 400
              ? `Anthropic rejected the request for "${env.ANTHROPIC_MODEL}" (400). The model id may be wrong for this account.`
              : `Could not complete the test call to Anthropic${error.status ? ` (HTTP ${error.status})` : ""}.`;
      return NextResponse.json({ error: hint }, { status: 502 });
    }
    return NextResponse.json({ error: "Connection test failed." }, { status: 500 });
  }

  const sessionId = await ensureSession();
  setSessionKey(sessionId, apiKey);

  return NextResponse.json(getConnectionStatus(sessionId));
}
