import { NextResponse } from "next/server";
import { z } from "zod";
import { getProviderForKey } from "@/lib/ai/client";
import { AIAuthenticationError, AIError } from "@/lib/ai/provider";

export const runtime = "nodejs";

const BodySchema = z.object({ apiKey: z.string().min(1) });

/**
 * Lists the models a credential can actually reach.
 *
 * Model availability varies by account, and a configured id the account cannot
 * use fails in a way indistinguishable from a bad key. This answers the
 * question directly instead of guessing ids one at a time.
 *
 * The credential is used for this call and discarded — nothing is stored.
 */
export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide an API key." }, { status: 400 });
  }

  try {
    const models = await getProviderForKey(parsed.data.apiKey.trim()).listModels();
    return NextResponse.json({ models });
  } catch (error) {
    if (error instanceof AIAuthenticationError) {
      return NextResponse.json({ error: "Anthropic rejected that credential." }, { status: 401 });
    }
    if (error instanceof AIError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Could not reach Anthropic." }, { status: 500 });
  }
}
