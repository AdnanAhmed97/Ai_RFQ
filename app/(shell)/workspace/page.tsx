import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { isDatabaseConfigured } from "@/lib/config/env";
import { loadWorkspace } from "@/lib/extraction/summary";
import { NotConfigured } from "@/components/system/not-configured";
import { Badge } from "@/components/ui/badge";

/**
 * Active sourcing events.
 *
 * Quoted value reads "—" until the pricing engine exists. A rupee total on the
 * first screen that no evidence stands behind is the fabrication this product
 * is built to prevent.
 */
const STATUS_TONE: Record<string, "neutral" | "signal" | "verified" | "review"> = {
  DRAFT: "neutral",
  SENT: "neutral",
  RESPONSES: "signal",
  ANALYSIS: "signal",
  DECISION: "review",
  AWARDED: "verified",
};

export default async function WorkspacePage() {
  if (!isDatabaseConfigured()) {
    return (
      <div className="p-6">
        <NotConfigured
          title="Database not configured"
          detail="Sourcing events are read from Postgres. Set a connection string, apply the migrations, then seed the demo dataset."
          variables={["DATABASE_URL"]}
        />
      </div>
    );
  }

  const events = await loadWorkspace();

  if (events.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm">No sourcing events.</p>
          <p className="ink-3 mt-1.5 text-xs">
            Describe what you need in plain language and the copilot drafts the scope, line
            items, questionnaire and commercial terms.
          </p>
          <p className="ink-3 num mt-3 text-micro">npm run db:seed</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rule-b flex items-center justify-between gap-4 px-4 py-2.5">
        <p className="label">Sourcing events · {events.length}</p>
        <Link
          href="/rfx/new"
          className="inline-flex items-center gap-1.5 rounded-sm bg-signal px-2.5 py-1 text-xs font-medium text-gr-960 transition-colors hover:bg-signal/85"
        >
          Create RFx with AI
          <ArrowRight className="size-3" aria-hidden />
        </Link>
      </div>

      <table className="grid-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Category</th>
            <th className="text-right">Vendors</th>
            <th className="text-right">Lines</th>
            <th className="text-right">Documents read</th>
            <th className="text-right">Quoted value</th>
            <th className="text-right">Open issues</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>
                <Link
                  href={`/rfx/${event.id}/responses`}
                  className="font-medium hover:text-signal"
                >
                  {event.title}
                </Link>
              </td>
              <td className="ink-2">{event.category}</td>
              <td className="num text-right">{event.vendorCount}</td>
              <td className="num text-right">{event.lineItemCount}</td>
              <td className="num text-right">
                {event.processedDocumentCount}
                <span className="text-gr-700">/{event.documentCount}</span>
              </td>
              <td className="num ink-3 text-right" title="Awaiting the pricing engine">
                {event.quotedValueInr === null ? "—" : event.quotedValueInr}
              </td>
              <td className="num text-right">
                {event.processedDocumentCount === 0 ? (
                  <span className="ink-3">—</span>
                ) : (
                  <span className={event.openIssueCount > 0 ? "text-review" : "ink-3"}>
                    {event.openIssueCount}
                  </span>
                )}
              </td>
              <td>
                <Badge tone={STATUS_TONE[event.status] ?? "neutral"}>{event.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
