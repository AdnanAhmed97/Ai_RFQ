import { isDatabaseConfigured } from "@/lib/config/env";
import { loadTruthView } from "@/lib/extraction/truth-view";
import { NotConfigured } from "@/components/system/not-configured";
import { MetricStrip } from "@/components/shell/metric-strip";
import { TruthTable } from "@/components/truth/truth-table";
import { AnalyseControls } from "@/components/truth/analyse-controls";

/**
 * Commercial Truth: the comparison the buyer came for.
 *
 * Nothing here is computed on render — it is read from `commercial_truth`,
 * which the pricing engine wrote. A blocked cell shows its quoted value struck
 * through, because the fact that a supplier quoted per bundle with no pack size
 * is more useful than an empty square.
 */
export default async function TruthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!isDatabaseConfigured()) {
    return (
      <div className="p-6">
        <NotConfigured
          title="Database not configured"
          detail="The comparison is read from Postgres."
          variables={["DATABASE_URL"]}
        />
      </div>
    );
  }

  const view = await loadTruthView(id);
  if (!view) {
    return (
      <div className="p-6">
        <h2 className="text-sm font-medium">RFx not found</h2>
      </div>
    );
  }

  const { totals } = view;

  if (totals.extractedCells === 0) {
    return (
      <>
        <div className="rule-b flex items-center justify-between gap-4 px-4 py-2">
          <p className="label">Commercial truth</p>
          <AnalyseControls rfqId={view.rfqId} hasTruth={false} />
        </div>
        <div className="flex min-h-[50vh] items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <p className="text-sm">Nothing to compare yet.</p>
            <p className="ink-3 mt-1.5 text-xs">
              Read the supplier documents on the Responses screen, then build the comparison. Every
              value here is normalized from what was actually extracted.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="rule-b flex items-center justify-between gap-4 px-4 py-2">
        <p className="label">
          Commercial truth · {totals.lines} lines × {view.vendors.length} suppliers
        </p>
        <AnalyseControls rfqId={view.rfqId} hasTruth />
      </div>

      <MetricStrip
        metrics={[
          {
            label: "Comparable",
            value: `${totals.comparableCells}/${totals.extractedCells}`,
            note: "quotes normalized",
          },
          { label: "Verified", value: String(totals.byConfidence.VERIFIED), tone: "verified" },
          { label: "Inferred", value: String(totals.byConfidence.INFERRED) },
          {
            label: "Needs review",
            value: String(totals.byConfidence.REVIEW_REQUIRED),
            tone: totals.byConfidence.REVIEW_REQUIRED ? "review" : "muted",
          },
          {
            label: "Blocked",
            value: String(totals.byConfidence.BLOCKED),
            tone: totals.byConfidence.BLOCKED ? "review" : "muted",
            note: "cannot be compared",
          },
          {
            label: "Open issues",
            value: String(totals.openIssues),
            tone: totals.blockerIssues > 0 ? "conflict" : totals.openIssues ? "review" : "muted",
            note: totals.blockerIssues > 0 ? `${totals.blockerIssues} blocking` : undefined,
          },
        ]}
      />

      <p className="ink-3 rule-b px-4 py-2 text-micro">
        Rates are per unit, normalized to INR. A struck-through value could not be compared — click
        any cell for its source. The green mark is the cheapest comparable quote on that line, which
        is not the same as the best award.
      </p>

      <TruthTable view={view} />
    </>
  );
}
