import { Download } from "lucide-react";
import { isDatabaseConfigured } from "@/lib/config/env";
import { getSql } from "@/lib/db/sql";
import { loadAnalysisSnapshot } from "@/lib/pricing/analysis";
import { calculateAward } from "@/lib/pricing/award";
import { canReceiveAward } from "@/lib/pricing/eligibility";
import { formatPaise } from "@/lib/pricing/money";
import { NotConfigured } from "@/components/system/not-configured";
import { MetricStrip } from "@/components/shell/metric-strip";
import { Badge } from "@/components/ui/badge";

/**
 * The award decision brief, for a VP who was not in the analysis.
 *
 * Every figure is computed here from the same snapshot the Decision surface
 * uses — none of it is narrated by a model. The open-issues section is not an
 * appendix: it is the part that earns the recommendation its credibility.
 */
export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!isDatabaseConfigured()) {
    return (
      <div className="p-6">
        <NotConfigured
          title="Database not configured"
          detail="The brief is computed from the comparison in Postgres."
          variables={["DATABASE_URL"]}
        />
      </div>
    );
  }

  const sql = getSql();
  const [truth] = await sql<{ count: number }[]>`
    select count(*)::int from commercial_truth where rfq_id = ${id}
  `;
  const snapshot = (truth?.count ?? 0) > 0 ? await loadAnalysisSnapshot(id) : null;

  if (!snapshot) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm">No decision to brief yet.</p>
          <p className="ink-3 mt-1.5 text-xs">
            Build the comparison on the Commercial Truth screen first.
          </p>
        </div>
      </div>
    );
  }

  const reviewed = snapshot.eligibility.some((e) => e.status !== "UNDETERMINED");
  const eligible = snapshot.eligibility.filter((e) => canReceiveAward(e));
  const names = new Map(snapshot.vendors.map((v) => [v.id, v.shortLabel]));

  const split = calculateAward({
    lines: snapshot.lines,
    quotes: snapshot.quotes,
    options: {
      eligibleVendorIds: reviewed ? eligible.map((e) => e.vendorId) : null,
      includeFreight: false,
    },
  });

  const byVendor = new Map<string, { lines: number; valuePaise: number }>();
  for (const allocation of split.allocations) {
    const entry = byVendor.get(allocation.vendorId) ?? { lines: 0, valuePaise: 0 };
    entry.lines += 1;
    entry.valuePaise += allocation.lineValuePaise;
    byVendor.set(allocation.vendorId, entry);
  }

  const issues = await sql<{ category: string; severity: string; summary: string; short_label: string }[]>`
    select ci.category::text as category, ci.severity::text as severity, ci.summary, v.short_label
      from commercial_issues ci join vendors v on v.id = ci.vendor_id
     where ci.rfq_id = ${id} and ci.resolved_at is null and ci.severity = 'BLOCKER'
     order by v.short_label limit 20
  `;

  return (
    <>
      <div className="rule-b flex items-center justify-between gap-4 px-4 py-2">
        <p className="label">Award decision brief</p>
        <a
          href={`/api/rfx/${id}/export?format=csv`}
          className="inline-flex items-center gap-1.5 rounded-sm border border-[var(--rule-strong)] px-2.5 py-1 text-xs transition-colors hover:border-gr-700"
        >
          <Download className="size-3" aria-hidden />
          Export comparison (CSV)
        </a>
      </div>

      <MetricStrip
        metrics={[
          {
            label: "Recommended",
            value: formatPaise(split.totalPaise),
            note: "split award, ex-freight",
            tone: split.complete ? "default" : "review",
          },
          {
            label: "Lines awarded",
            value: `${split.allocations.length}/${snapshot.lines.length}`,
            tone: split.complete ? "verified" : "review",
          },
          {
            label: "Suppliers used",
            value: String(byVendor.size),
          },
          {
            label: "Evidence coverage",
            value: `${Math.round(split.evidenceCoverage * 100)}%`,
            note: "of award value verified",
          },
          {
            label: "Open blockers",
            value: String(issues.length),
            tone: issues.length ? "conflict" : "muted",
          },
        ]}
      />

      <section className="max-w-4xl px-4 py-5">
        <h2 className="text-sm font-medium">Recommendation</h2>
        <p className="ink-2 mt-2 max-w-[70ch] text-xs leading-relaxed">
          A split award across {byVendor.size} supplier{byVendor.size === 1 ? "" : "s"} totalling{" "}
          <span className="num">{formatPaise(split.totalPaise)}</span>, comparing on quoted rates
          before freight.{" "}
          {split.complete
            ? `All ${snapshot.lines.length} lines are covered.`
            : `${split.unawarded.length} of ${snapshot.lines.length} lines could not be awarded and are excluded from this total — it is not the cost of the whole requirement.`}
        </p>
        <p className="ink-3 mt-2 max-w-[70ch] text-xs">
          {reviewed
            ? `${eligible.length} of ${snapshot.vendors.length} suppliers cleared the eligibility requirements.`
            : "Eligibility has not been reviewed, so no supplier has been excluded. This award assumes all of them qualify."}{" "}
          {snapshot.fxNote}
        </p>
      </section>

      <section>
        <p className="label rule-b rule-t px-4 py-2">Allocation</p>
        <table className="grid-table max-w-4xl">
          <thead>
            <tr>
              <th>Supplier</th>
              <th className="w-20 text-right">Lines</th>
              <th className="w-28 text-right">Value</th>
              <th className="w-20 text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {[...byVendor.entries()]
              .sort((a, b) => b[1].valuePaise - a[1].valuePaise)
              .map(([vendorId, entry]) => (
                <tr key={vendorId}>
                  <td>{names.get(vendorId)}</td>
                  <td className="num text-right">{entry.lines}</td>
                  <td className="num text-right">{formatPaise(entry.valuePaise)}</td>
                  <td className="num ink-3 text-right">
                    {Math.round((entry.valuePaise / split.totalPaise) * 100)}%
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      {split.unawarded.length > 0 ? (
        <section>
          <p className="label rule-b rule-t px-4 py-2">
            Not awarded · {split.unawarded.length} lines
          </p>
          <table className="grid-table max-w-4xl">
            <tbody>
              {split.unawarded.map((line) => (
                <tr key={line.rfqLineId}>
                  <td className="num w-28">{line.skuCode}</td>
                  <td className="ink-2">{line.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section>
        <p className="label rule-b rule-t px-4 py-2">
          Before approving · {issues.length} blocking issues
        </p>
        {issues.length === 0 ? (
          <p className="ink-3 px-4 py-3 text-xs">No blocking issues outstanding.</p>
        ) : (
          <table className="grid-table max-w-4xl">
            <tbody>
              {issues.map((issue, index) => (
                <tr key={index}>
                  <td className="w-24">
                    <Badge tone="conflict">{issue.short_label}</Badge>
                  </td>
                  <td>{issue.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="ink-3 rule-t max-w-[70ch] px-4 py-3 text-micro">
          {split.inferredLineCount > 0
            ? `${split.inferredLineCount} awarded lines rest on an inferred reading rather than a value stated outright. `
            : ""}
          Every figure above was computed from the extracted data; none of it was written by a
          model.
        </p>
      </section>
    </>
  );
}
