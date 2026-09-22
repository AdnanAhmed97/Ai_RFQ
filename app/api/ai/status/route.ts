import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/session/session";
import { getConnectionStatus } from "@/lib/ai/key-store";

export const runtime = "nodejs";

/** Connection state for the UI. Returns no fragment of the key itself. */
export async function GET() {
  const sessionId = await getSessionId();
  return NextResponse.json(getConnectionStatus(sessionId));
}
