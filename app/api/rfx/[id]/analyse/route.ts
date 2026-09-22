import { NextResponse } from "next/server";
import { getSql, isSqlConfigured } from "@/lib/db/sql";
import { getProviderForSession } from "@/lib/ai/client";
import { AICredentialsMissingError } from "@/lib/ai/provider";
import { buildCommercialTruth } from "@/lib/pricing/truth-builder";
import { reviewEligibility } from "@/lib/extraction/eligibility-review";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Builds the comparable layer.
 *
 * Two passes, deliberately separate. Normalization is pure arithmetic over what
 * was extracted and needs no model at all. The eligibility review needs one,
 * because deciding whether a conditional answer meets a requirement is a
 * reading of language — but its verdicts are then enforced by code.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rfqId } = await params;

  if (!isSqlConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const sql = getSql();
  const [pending] = await sql<{ count: number }[]>`
    select count(*)::int from extraction_jobs
     where rfq_id = ${rfqId} and state not in ('COMPLETE', 'NEEDS_REVIEW', 'FAILED')
  `;
  if ((pending?.count ?? 0) > 0) {
    return NextResponse.json(
      { error: `${pending!.count} documents are still being read. Finish ingestion first.` },
      { status: 409 },
    );
  }

  // --- Normalization: deterministic, no model ----------------------------
  const truth = await buildCommercialTruth(rfqId);

  // --- Eligibility: the model reads, the engine decides -------------------
  const url = new URL(request.url);
  const skipEligibility = url.searchParams.get("skipEligibility") === "true";

  let eligibility: Awaited<ReturnType<typeof reviewEligibility>> = [];
  if (!skipEligibility) {
    try {
      const provider = await getProviderForSession("eligibility_review");
      eligibility = await reviewEligibility({ provider, rfqId });
    } catch (error) {
      if (error instanceof AICredentialsMissingError) {
        return NextResponse.json(
          {
            error: "Connect an AI provider to review eligibility.",
            truth,
          },
          { status: 401 },
        );
      }
      throw error;
    }
  }

  await sql`update rfqs set status = 'ANALYSIS', updated_at = now() where id = ${rfqId}`;

  return NextResponse.json({ truth, eligibility });
}
