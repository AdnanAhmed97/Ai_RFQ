import { isDatabaseConfigured } from "@/lib/config/env";
import { loadRfxDetail } from "@/lib/extraction/rfx-view";
import { NotConfigured } from "@/components/system/not-configured";
import { Badge } from "@/components/ui/badge";

/**
 * The RFx itself: what the buyer asked for.
 *
 * Read from the database. Slice 2 adds the copilot that authors and edits this;
 * being able to read it does not need to wait for that.
 */
export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!isDatabaseConfigured()) {
    return (
      <div className="p-6">
        <NotConfigured
          title="Database not configured"
          detail="The RFx is read from Postgres."
          variables={["DATABASE_URL"]}
        />
      </div>
    );
  }

  const rfx = await loadRfxDetail(id);
  if (!rfx) {
    return (
      <div className="p-6">
        <h2 className="text-sm font-medium">RFx not found</h2>
        <p className="ink-3 num mt-1.5 text-xs">npm run db:seed</p>
      </div>
    );
  }

  const terms = rfx.commercialTerms as Record<string, string | number | undefined>;

  return (
    <>
      <section className="rule-b px-4 py-3">
        <p className="ink-2 max-w-[70ch] text-xs">{rfx.objective}</p>
        <p className="ink-3 mt-1.5 max-w-[70ch] text-xs">{rfx.scope}</p>
      </section>

      <dl className="rule-b flex overflow-x-auto">
        {[
          ["Currency", terms.currency],
          ["Pricing basis", terms.pricingBasis],
          ["Payment", terms.paymentTermsDays ? `${terms.paymentTermsDays} days` : "—"],
          ["Freight", terms.freightExpectation],
          ["Validity", terms.quoteValidityDays ? `${terms.quoteValidityDays} days` : "—"],
          ["Delivery", terms.deliveryTerms],
        ].map(([label, value]) => (
          <div key={String(label)} className="rule-r min-w-[9rem] flex-1 px-4 py-2 last:border-r-0">
            <dt className="label">{label}</dt>
            <dd className="mt-1 truncate text-xs" title={String(value ?? "—")}>
              {String(value ?? "—")}
            </dd>
          </div>
        ))}
      </dl>

      <section>
        <p className="label rule-b px-4 py-2">Line items · {rfx.lines.length}</p>
        <div className="overflow-x-auto">
          <table className="grid-table min-w-[58rem]">
            <thead>
              <tr>
                <th className="w-10 text-right">#</th>
                <th className="w-28">SKU</th>
                <th>Description</th>
                <th className="w-64">Specification</th>
                <th className="w-24 text-right">Annual qty</th>
                <th className="w-16">Unit</th>
              </tr>
            </thead>
            <tbody>
              {rfx.lines.map((line) => (
                <tr key={line.id}>
                  <td className="ink-3 num text-right">{line.position}</td>
                  <td className="num">{line.skuCode}</td>
                  <td>{line.description}</td>
                  <td className="ink-3 truncate text-micro">
                    {Object.entries(line.specifications)
                      .filter(([k]) => ["ply", "liner", "flute", "burstingStrength"].includes(k))
                      .map(([, v]) => v)
                      .join(" · ") || "—"}
                  </td>
                  <td className="num text-right">{line.quantity.toLocaleString("en-IN")}</td>
                  <td className="ink-3">{line.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <p className="label rule-b rule-t px-4 py-2">
          Questionnaire · {rfx.questions.length} questions ·{" "}
          {rfx.questions.filter((q) => q.mandatoryForEligibility).length} eligibility-bearing
        </p>
        <table className="grid-table">
          <tbody>
            {rfx.questions.map((question) => (
              <tr key={question.id}>
                <td className="num ink-3 w-9">{question.ref}</td>
                <td>{question.question}</td>
                <td className="ink-3 w-28 text-micro uppercase">{question.type}</td>
                <td className="w-24">
                  {question.mandatoryForEligibility ? (
                    <Badge tone="review">Eligibility</Badge>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <p className="label rule-b rule-t px-4 py-2">Evaluation criteria</p>
        <table className="grid-table">
          <tbody>
            {rfx.criteria.map((criterion) => (
              <tr key={criterion.label}>
                <td className="num w-14 text-right">{criterion.weight}%</td>
                <td className="w-56 font-medium">{criterion.label}</td>
                <td className="ink-3">{criterion.description ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
