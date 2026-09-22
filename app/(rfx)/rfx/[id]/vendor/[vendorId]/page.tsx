import { ExternalLink } from "lucide-react";
import { isDatabaseConfigured } from "@/lib/config/env";
import { loadVendorDetail, type ExtractedQuoteView } from "@/lib/extraction/rfx-view";
import { NotConfigured } from "@/components/system/not-configured";
import { MetricStrip } from "@/components/shell/metric-strip";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "@/components/truth/confidence-badge";
import type { ConfidenceState } from "@/types";

/**
 * One supplier's submission, as extracted.
 *
 * Every row states what the document said, where it was read from, and how
 * confident the reading is. The evidence column is monospace and carries the
 * literal source text — this is the product's whole claim, made inspectable a
 * line at a time.
 */
/**
 * "quotation.pdf, page 1, row 6" — a reference a buyer can act on.
 *
 * The column is often a header name rather than a letter, so it rides in the
 * tooltip with the source text instead of being jammed onto the end of the row
 * number, where it read as one broken token.
 */
function sourceLabel(quote: ExtractedQuoteView): string {
  const evidence = quote.evidence;
  if (!evidence) return "—";
  const parts = [quote.documentName];
  if (evidence.sheet) parts.push(evidence.sheet);
  if (evidence.page) parts.push(`page ${evidence.page}`);
  if (evidence.row) parts.push(`row ${evidence.row}`);
  return parts.join(", ");
}

function sourceTitle(quote: ExtractedQuoteView): string | undefined {
  const evidence = quote.evidence;
  if (!evidence) return undefined;
  const bits: string[] = [];
  if (evidence.column) bits.push(`Column: ${evidence.column}`);
  if (evidence.sourceText) bits.push(`Read as "${evidence.sourceText}"`);
  return bits.length > 0 ? bits.join(" · ") : undefined;
}

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string; vendorId: string }>;
}) {
  const { id, vendorId } = await params;

  if (!isDatabaseConfigured()) {
    return (
      <div className="p-6">
        <NotConfigured
          title="Database not configured"
          detail="Supplier submissions are read from Postgres."
          variables={["DATABASE_URL"]}
        />
      </div>
    );
  }

  const vendor = await loadVendorDetail(id, vendorId);
  if (!vendor) {
    return (
      <div className="p-6">
        <h2 className="text-sm font-medium">Supplier not found</h2>
      </div>
    );
  }

  const matched = vendor.quotes.filter((q) => q.matchStatus === "MATCHED").length;
  const blockers = vendor.issues.filter((i) => i.severity === "BLOCKER").length;
  const byState = (state: string) => vendor.quotes.filter((q) => q.confidence === state).length;

  return (
    <>
      <div className="rule-b flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2">
        <h2 className="text-xs font-medium">{vendor.shortLabel}</h2>
        <p className="ink-3 text-xs">{vendor.name}</p>
        {blockers > 0 ? (
          <Badge tone="conflict" className="ml-auto">
            {blockers} blocking
          </Badge>
        ) : null}
      </div>

      <MetricStrip
        metrics={[
          {
            label: "Lines quoted",
            value: `${matched}/${vendor.lineItemCount}`,
            note: matched < vendor.lineItemCount ? `${vendor.lineItemCount - matched} not quoted` : undefined,
          },
          { label: "Verified", value: String(byState("VERIFIED")), tone: "verified" },
          { label: "Review", value: String(byState("REVIEW_REQUIRED")), tone: byState("REVIEW_REQUIRED") ? "review" : "muted" },
          { label: "Blocked", value: String(byState("BLOCKED")), tone: byState("BLOCKED") ? "review" : "muted" },
          { label: "Conflict", value: String(byState("CONFLICT")), tone: byState("CONFLICT") ? "conflict" : "muted" },
          { label: "Open issues", value: String(vendor.issues.length), tone: vendor.issues.length ? "review" : "muted" },
        ]}
      />

      <section className="rule-b">
        <p className="label px-4 pt-2.5 pb-1.5">Documents received</p>
        <ul className="px-4 pb-2.5">
          {vendor.documents.map((document) => (
            <li key={document.id} className="flex h-7 items-center gap-3 text-xs">
              <span className="ink-3 w-12 shrink-0 text-micro">{document.kind}</span>
              <a
                href={`/api/documents/${document.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1.5 underline decoration-gr-780 transition-colors hover:text-signal hover:decoration-signal"
              >
                <span className="truncate">{document.filename}</span>
                <ExternalLink className="size-2.5 shrink-0" aria-hidden />
              </a>
              <span className="num ink-3 ml-auto shrink-0 text-micro">
                {Math.round(document.byteSize / 1024)} KB
              </span>
              <Badge
                tone={document.state === "FAILED" ? "conflict" : document.state === "NEEDS_REVIEW" ? "review" : "verified"}
                className="w-28 shrink-0 justify-end"
              >
                {document.state === "NEEDS_REVIEW"
                  ? "Needs review"
                  : document.state.charAt(0) + document.state.slice(1).toLowerCase()}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <p className="label rule-b px-4 py-2">Extracted quotes · {vendor.quotes.length}</p>
        {vendor.quotes.length === 0 ? (
          <p className="ink-3 px-4 py-6 text-center text-xs">
            Nothing extracted from this supplier yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="grid-table min-w-[64rem]">
              <thead>
                <tr>
                  <th className="w-32">RFx line</th>
                  <th>What the supplier wrote</th>
                  <th className="w-28 text-right">Quoted</th>
                  <th className="w-28">Basis</th>
                  <th className="w-52">Source</th>
                  <th className="w-28">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {vendor.quotes.map((quote) => (
                  <tr key={quote.id}>
                    <td>
                      {quote.rfqLineSku ? (
                        <>
                          <span className="num">{quote.rfqLineSku}</span>
                          {quote.matchScore !== null && quote.matchScore < 0.9 ? (
                            <span
                              className="num ml-2 text-micro text-inferred"
                              title={quote.matchReasoning ?? "Lower-confidence match"}
                            >
                              {Math.round(quote.matchScore * 100)}%
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <Badge tone="review">
                        {quote.matchStatus === "REVIEW_REQUIRED" ? "Review match" : "Unmatched"}
                      </Badge>
                      )}
                    </td>
                    <td className="ink-2 max-w-[24rem] truncate" title={quote.rawDescription ?? undefined}>
                      {quote.rawDescription ?? "—"}
                    </td>
                    <td className="num text-right text-sm">
                      {quote.quotedPrice === null ? (
                        <span className="ink-3">—</span>
                      ) : (
                        <>
                          <span className="ink-3 mr-0.5">
                            {quote.currency === "USD" ? "$" : "₹"}
                          </span>
                          {quote.quotedPrice.toFixed(2)}
                        </>
                      )}
                    </td>
                    <td className="ink-2">
                      {quote.quotedUnit ?? "—"}
                      {quote.quantityBasis ? (
                        <span className="num ink-3 ml-1">×{quote.quantityBasis}</span>
                      ) : null}
                    </td>
                    <td className="ink-3">
                      {quote.evidence ? (
                        <span className="block truncate" title={sourceTitle(quote)}>
                          {sourceLabel(quote)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <ConfidenceBadge state={quote.confidence as ConfidenceState} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <p className="label rule-b rule-t px-4 py-2">Questionnaire</p>
        <table className="grid-table">
          <tbody>
            {vendor.answers.map((answer) => (
              <tr key={answer.ref}>
                <td className="num ink-3 w-9 align-top">{answer.ref}</td>
                <td className="w-[26rem] align-top">
                  <span className="ink-3 block text-xs">{answer.question}</span>
                </td>
                <td className="align-top">{answer.rawAnswer ?? "—"}</td>
                <td className="w-24 align-top">
                  {answer.mandatoryForEligibility ? (
                    <Badge tone="review">Eligibility</Badge>
                  ) : null}
                </td>
                <td className="w-24 align-top">
                  <ConfidenceBadge state={answer.confidence as ConfidenceState} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ink-3 rule-t px-4 py-2 text-micro">
          Whether an answer satisfies a requirement is decided by the eligibility engine from this
          text. Nothing here has been judged yet.
        </p>
      </section>

      <section>
        <p className="label rule-b rule-t px-4 py-2">Issues · {vendor.issues.length}</p>
        <table className="grid-table">
          <tbody>
            {vendor.issues.slice(0, 60).map((issue, index) => (
              <tr key={index}>
                <td className="w-40 align-top">
                  <Badge tone={issue.severity === "BLOCKER" ? "conflict" : "review"}>
                    {issue.category
                      .toLowerCase()
                      .replace(/_/g, " ")
                      .replace(/^./, (c) => c.toUpperCase())}
                  </Badge>
                </td>
                <td className="num ink-3 w-24 align-top">{issue.skuCode ?? "—"}</td>
                <td className="align-top">
                  <span className="block">{issue.summary}</span>
                  {issue.detail ? (
                    <span className="ink-3 mt-0.5 block text-micro">{issue.detail}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {vendor.issues.length > 60 ? (
          <p className="ink-3 rule-t px-4 py-2 text-micro">
            Showing 60 of {vendor.issues.length}.
          </p>
        ) : null}
      </section>
    </>
  );
}
