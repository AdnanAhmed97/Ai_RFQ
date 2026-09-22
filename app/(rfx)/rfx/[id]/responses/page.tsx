import Link from "next/link";
import { isDatabaseConfigured } from "@/lib/config/env";
import { loadResponsesView } from "@/lib/extraction/summary";
import { NotConfigured } from "@/components/system/not-configured";
import { MetricStrip } from "@/components/shell/metric-strip";
import { ProcessControls } from "@/components/vendors/process-controls";
import { Badge } from "@/components/ui/badge";
import { STATE_LABELS, type ExtractionJobState } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

/**
 * Ingestion status across every supplier and document.
 *
 * One row per document rather than a card per vendor: the buyer's question here
 * is "what has been read and what has not", which is a list, not a gallery.
 */
const STATE_TONE: Record<ExtractionJobState, "neutral" | "signal" | "verified" | "review" | "conflict"> = {
  QUEUED: "neutral",
  PROCESSING: "signal",
  EXTRACTING: "signal",
  MATCHING: "signal",
  VALIDATING: "signal",
  COMPLETE: "verified",
  NEEDS_REVIEW: "review",
  FAILED: "conflict",
};

function bytes(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

export default async function ResponsesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!isDatabaseConfigured()) {
    return (
      <div className="p-6">
        <NotConfigured
          title="Database not configured"
          detail="Supplier responses, documents and extraction jobs are read from Postgres."
          variables={["DATABASE_URL"]}
        />
      </div>
    );
  }

  const view = await loadResponsesView(id);
  if (!view) {
    return (
      <div className="p-6">
        <div className="rule-b panel rounded-sm border p-5">
          <h2 className="text-sm font-medium">RFx not found</h2>
          <p className="ink-3 num mt-1.5 text-xs">npm run db:seed</p>
        </div>
      </div>
    );
  }

  const documents = view.vendors.flatMap((vendor) =>
    vendor.documents.map((document) => ({ ...document, vendor })),
  );
  const read = documents.filter((d) =>
    ["COMPLETE", "NEEDS_REVIEW"].includes(d.jobState),
  ).length;

  return (
    <>
      <div className="rule-b flex items-center justify-between gap-4 px-4 py-2">
        <p className="label">
          Ingestion · {view.vendors.length} suppliers · {documents.length} documents
        </p>
        <ProcessControls rfqId={view.rfqId} queued={view.queued} failed={view.failed} />
      </div>

      <MetricStrip
        metrics={[
          { label: "Documents read", value: `${read}/${documents.length}` },
          { label: "Queued", value: String(view.queued), tone: view.queued ? "default" : "muted" },
          { label: "In flight", value: String(view.inFlight), tone: view.inFlight ? "default" : "muted" },
          { label: "Failed", value: String(view.failed), tone: view.failed ? "conflict" : "muted" },
          { label: "Quotes extracted", value: String(view.extractedQuoteCount) },
          { label: "Evidence records", value: String(view.evidenceCount) },
        ]}
      />

      {view.extractedQuoteCount === 0 ? (
        <p className="ink-3 rule-b px-4 py-2 text-xs">
          Nothing extracted yet. Documents are registered and queued; the pipeline reads them
          when you start it.
        </p>
      ) : null}

      <table className="grid-table">
        <thead>
          <tr>
            <th>Supplier</th>
            <th>Document</th>
            <th className="w-16">Format</th>
            <th className="w-20 text-right">Size</th>
            <th className="w-28 text-right">Lines quoted</th>
            <th className="w-36">Stage</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <tr key={document.id}>
              <td>
                <Link
                  href={`/rfx/${view.rfqId}/vendor/${document.vendor.vendorId}`}
                  className="hover:text-signal"
                >
                  <span className="font-medium">{document.vendor.shortLabel}</span>
                  <span className="ink-3 ml-1.5">{document.vendor.name}</span>
                </Link>
              </td>
              <td>
                <a
                  href={`/api/documents/${document.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-signal underline decoration-gr-780 hover:decoration-signal"
                >
                  {document.filename}
                </a>
              </td>
              <td className="ink-3 text-micro">{document.kind}</td>
              <td className="num ink-2 text-right">{bytes(document.byteSize)}</td>
              <td className="num text-right">
                {document.vendor.quotedLineCount === null ? (
                  <span className="ink-3">—</span>
                ) : (
                  <>
                    {document.vendor.quotedLineCount}
                    <span className="text-gr-700">/{document.vendor.expectedLineCount ?? "?"}</span>
                  </>
                )}
              </td>
              <td>
                <Badge tone={STATE_TONE[document.jobState]}>
                  {STATE_LABELS[document.jobState]}
                </Badge>
              </td>
              <td
                className={cn(
                  "max-w-[22rem] truncate text-xs",
                  document.error ? "text-conflict" : "ink-3",
                )}
                title={document.error ?? document.reviewReason ?? undefined}
              >
                {document.error ?? document.reviewReason ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
