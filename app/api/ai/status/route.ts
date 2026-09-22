import { NextResponse } from "next/server";
import { getConnectionStatus } from "@/lib/ai/key-store";

export const runtime = "nodejs";

/** Connection state for the UI. Returns no fragment of the key itself. */
export async function GET() {
  return NextResponse.json(await getConnectionStatus());
}
