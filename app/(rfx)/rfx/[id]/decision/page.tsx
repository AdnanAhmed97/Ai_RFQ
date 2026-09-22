import { isDatabaseConfigured } from "@/lib/config/env";
import { getSql } from "@/lib/db/sql";
import { loadAnalysisSnapshot } from "@/lib/pricing/analysis";
import { calculateAward } from "@/lib/pricing/award";
import { canReceiveAward } from "@/lib/pricing/eligibility";
import { formatPaise } from "@/lib/pricing/money";
import { NotConfigured } from "@/components/system/not-configured";
import { MetricStrip } from "@/components/shell/metric-strip";
import { DecisionChat } from "@/components/decision/decision-chat";
import { Badge } from "@/components/ui/badge";

/**
 * The Decision surface.
 *
 * A standing split award on the left so the buyer has a figure to argue with,
 * and the copilot on the right to interrogate it. Both read the same snapshot,
 * so the conversation and the panel can never disagree.
 */
export default async function DecisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!isDatabaseConfigured()) {
    return (
      <div className="p-6">
        <NotConfigured
          title="Database not configured"
          detail="The decision surface reads the comparison from Postgres."
          variables={["DATABASE_URL"]}
        />
      </div>
    );
  }

  const sql = getSql();
  const [truth] = await sql<{ count: number }[]>`
    select count(*)::int from commercial_truth where rfq_id = ${id}
  `;
  const ready = (truth?.count ?? 0) > 0;
  const snapshot = ready ? await loadAnalysisSnapshot(id) : null;

  // Eligibility that has not been reviewed yet is not a verdict. Filtering on
  // it before the review has run would silently exclude every supplier.
  const reviewed = (snapshot?.eligibility ?? []).some((e) => e.status !== "UNDETERMINED");
  const eligible = snapshot?.eligibility.filter((e) => canReceiveAward(e)) ?? [];
  const award = snapshot
    ? calculateAward({
        lines: snapshot.lines,
        quotes: snapshot.quotes,
        options: {
          eligibleVendorIds: reviewed ? eligible.map((e) => e.vendorId) : null,
          includeFreight: false,
        },
      })
    : null;

  const names = new Map(snapshot?.vendors.map((v) => [v.id, v.shortLabel]) ?? []);
  const byVendor = new Map<string, { lines: number; valuePaise: number }>();
  for (const allocation of award?.allocations ?? []) {
    const entry = byVendor.get(allocation.vendorId) ?? { lines: 0, valuePaise: 0 };
    entry.lines += 1;
    entry.valuePaise += allocation.lineValuePaise;
    byVendor.set(allocation.vendorId, entry);
  }

  return (
    <div className="flex h-[calc(100dvh-var(--bar-h))]">
      <section className="rule-r flex w-[26rem] shrink-0 flex-col overflow-y-auto">
        <p className="label rule-b px-4 py-2">Standing split award</p>

        {!ready || !award ? (
          <p className="ink-3 px-4 py-5 text-xs">
            Build the comparison on the Commercial Truth screen first.
          </p>
        ) : (
          <>
            <MetricStrip
              metrics={[
                {
                  label: "Split award",
                  value: formatPaise(award.totalPaise),
                  note: award.complete ? "all lines" : `${award.unawarded.length} lines unawarded`,
                  tone: award.complete ? "default" : "review",
                },
              ]}
            />

            <table className="grid-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th className="w-14 text-right">Lines</th>
                  <th className="w-24 text-right">Value</th>
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
                    </tr>
                  ))}
              </tbody>
            </table>

            <p className="label rule-t rule-b px-4 py-2">Before acting</p>
            <ul className="px-4 py-2.5">
              {award.unawarded.length > 0 ? (
                <li className="flex gap-2 py-1 text-xs">
                  <Badge tone="review">{award.unawarded.length}</Badge>
                  <span className="ink-2">lines could not be awarded and are excluded from this total.</span>
                </li>
              ) : null}
              {award.inferredLineCount > 0 ? (
                <li className="flex gap-2 py-1 text-xs">
                  <Badge tone="inferred">{award.inferredLineCount}</Badge>
                  <span className="ink-2">awarded lines rest on an inferred reading.</span>
                </li>
              ) : null}
              {reviewed ? (
                snapshot!.eligibility
                  .filter((e) => !canReceiveAward(e))
                  .map((e) => (
                    <li key={e.vendorId} className="flex gap-2 py-1 text-xs">
                      <Badge tone="conflict">{names.get(e.vendorId)}</Badge>
                      <span className="ink-2">{e.reasons[0]}</span>
                    </li>
                  ))
              ) : (
                <li className="flex gap-2 py-1 text-xs">
                  <Badge tone="review">Eligibility</Badge>
                  <span className="ink-2">
                    Not reviewed yet — no supplier has been excluded, so this award assumes all
                    five qualify.
                  </span>
                </li>
              )}
              <li className="ink-3 py-1 text-micro">
                Compared ex-freight. {snapshot!.fxNote}
              </li>
            </ul>
          </>
        )}
      </section>

      <section className="min-w-0 flex-1">
        <DecisionChat rfqId={id} ready={ready} />
      </section>
    </div>
  );
}
