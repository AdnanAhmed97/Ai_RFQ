import { NextResponse } from "next/server";
import { env, isDatabaseConfigured, isDemoModeAvailable } from "@/lib/config/env";

export const runtime = "nodejs";

/**
 * Configuration readiness. Reports which subsystems are wired without
 * revealing any credential value.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    model: env.ANTHROPIC_MODEL,
    database: isDatabaseConfigured() ? "configured" : "not_configured",
    demoMode: isDemoModeAvailable() ? "available" : "disabled",
  });
}
