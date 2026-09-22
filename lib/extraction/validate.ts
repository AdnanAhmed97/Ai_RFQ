import type { DocumentExtraction } from "@/lib/ai/schemas";
import type { LineMatchBatch } from "@/lib/ai/schemas";
import type { IssueCategory, IssueSeverity } from "@/types";
import type { RfxContext } from "./context";

/**
 * Deterministic checks over what the model returned.
 *
 * Nothing here asks the model anything. These are the rules that decide whether
 * an extraction is trustworthy, and a model cannot be the judge of its own
 * output — if it could, a confident wrong answer would validate itself.
 *
 * Price normalization is NOT done here. That is the pricing engine's job, and
 * doing it early would mean converting values before anyone has confirmed the
 * pack sizes the conversion depends on.
 */

export interface ValidationIssue {
  category: IssueCategory;
  severity: IssueSeverity;
  summary: string;
  detail?: string;
  /** Index into extraction.quotes, when the issue belongs to one line. */
  quoteIndex?: number;
  rfqLineId?: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  /** True when a human must look before this data is used in an award. */
  needsReview: boolean;
  /** RFx lines this document produced a confident match for. */
  matchedLineIds: string[];
}

export function validateExtraction(params: {
  context: RfxContext;
  extraction: DocumentExtraction;
  matches: LineMatchBatch["matches"];
}): ValidationResult {
  const { context, extraction, matches } = params;
  const issues: ValidationIssue[] = [];
  const validLineIds = new Set(context.lines.map((l) => l.id));
  const matchByIndex = new Map(matches.map((m) => [m.vendorLineIndex, m]));

  // Every issue the model itself raised is carried through, not discarded.
  for (const issue of extraction.issues) {
    issues.push({
      category: issue.category,
      severity: issue.severity,
      summary: issue.summary,
      detail: issue.detail ?? undefined,
    });
  }

  const claimedLineIds = new Map<string, number[]>();

  extraction.quotes.forEach((quote, index) => {
    const match = matchByIndex.get(index);

    // Anything the model flagged about this line is carried through as a
    // warning; the specific category is decided by the rules below, from the
    // data rather than from the model's own classification.
    if (quote.concern) {
      issues.push({
        category: "LOW_EXTRACTION_CONFIDENCE",
        severity: "WARNING",
        summary: quote.concern,
        quoteIndex: index,
        rfqLineId: match?.rfqLineId ?? undefined,
      });
    }

    // A value with no source text is an assertion. The schema requires an
    // evidence object, but an empty one is the same failure.
    if (!quote.evidence.sourceText) {
      issues.push({
        category: "LOW_EXTRACTION_CONFIDENCE",
        severity: "BLOCKER",
        summary: "A quoted value arrived without any source reference.",
        detail: `Line ${index + 1} (${quote.rawDescription ?? "no description"}) cannot be traced back to the document.`,
        quoteIndex: index,
      });
    }

    // Priced per bundle or per pack with no stated quantity. Normalization is
    // impossible without inventing the pack size, so it is blocked here rather
    // than guessed later.
    const unit = (quote.quotedUnit ?? "").toLowerCase();
    const looksBundled = /bundle|box|pack|carton of|set of|per \d/.test(unit);
    if (quote.quotedPrice !== null && looksBundled && !quote.quantityBasis) {
      issues.push({
        category: "MISSING_PACK_SIZE",
        severity: "BLOCKER",
        summary: `Quoted "${quote.quotedUnit}" with no stated quantity per unit.`,
        detail:
          "A per-unit rate cannot be derived without the pack size, and the document does not state it.",
        quoteIndex: index,
        rfqLineId: match?.rfqLineId ?? undefined,
      });
    }

    if (quote.currency && quote.currency !== context.currency) {
      issues.push({
        category: "CURRENCY_MISMATCH",
        severity: "WARNING",
        summary: `Quoted in ${quote.currency} where the RFx asked for ${context.currency}.`,
        detail: "Conversion depends on an assumed rate, which the award must disclose.",
        quoteIndex: index,
        rfqLineId: match?.rfqLineId ?? undefined,
      });
    }

    if (quote.confidence === "REVIEW_REQUIRED" || quote.confidence === "CONFLICT") {
      issues.push({
        category:
          quote.confidence === "CONFLICT" ? "CONFLICTING_PRICE" : "LOW_EXTRACTION_CONFIDENCE",
        severity: quote.confidence === "CONFLICT" ? "BLOCKER" : "WARNING",
        summary:
          quote.confidence === "CONFLICT"
            ? "Sources disagree on this value."
            : "This value could not be read with confidence.",
        quoteIndex: index,
        rfqLineId: match?.rfqLineId ?? undefined,
      });
    }

    if (!match) {
      issues.push({
        category: "UNMATCHED_LINE",
        severity: "WARNING",
        summary: "No mapping was produced for a quoted line.",
        quoteIndex: index,
      });
      return;
    }

    // A match pointing at a line that does not exist is a model error, not a
    // supplier problem, and must not be silently dropped.
    if (match.rfqLineId && !validLineIds.has(match.rfqLineId)) {
      issues.push({
        category: "UNMATCHED_LINE",
        severity: "BLOCKER",
        summary: "A match referenced an RFx line that does not exist.",
        detail: `Returned id ${match.rfqLineId}.`,
        quoteIndex: index,
      });
      return;
    }

    if (match.status === "MATCHED" && match.rfqLineId) {
      const existing = claimedLineIds.get(match.rfqLineId) ?? [];
      existing.push(index);
      claimedLineIds.set(match.rfqLineId, existing);
    }
  });

  // Two of a supplier's own lines mapped to one RFx line. One of them is wrong,
  // and picking either would corrupt a total nobody re-checks.
  for (const [rfqLineId, indexes] of claimedLineIds) {
    if (indexes.length > 1) {
      const line = context.lines.find((l) => l.id === rfqLineId);
      issues.push({
        category: "CONFLICTING_PRICE",
        severity: "BLOCKER",
        summary: `${indexes.length} quoted lines were both mapped to ${line?.skuCode ?? "one RFx line"}.`,
        detail: "At most one can be right. Neither has been chosen.",
        rfqLineId,
      });
    }
  }

  const matchedLineIds = [...claimedLineIds.entries()]
    .filter(([, indexes]) => indexes.length === 1)
    .map(([lineId]) => lineId);

  const needsReview = issues.some(
    (issue) => issue.severity === "BLOCKER" || issue.category === "LOW_EXTRACTION_CONFIDENCE",
  );

  return { issues, needsReview, matchedLineIds };
}

/**
 * Lines the RFx asked for that this supplier never quoted.
 *
 * Run once per supplier after all their documents are in — a line absent from
 * the spreadsheet may well appear in the covering email.
 */
export function findMissingLines(params: {
  context: RfxContext;
  quotedLineIds: Set<string>;
}): ValidationIssue[] {
  return params.context.lines
    .filter((line) => !params.quotedLineIds.has(line.id))
    .map((line) => ({
      category: "MISSING_LINE" as const,
      severity: "WARNING" as const,
      summary: `No quote for ${line.skuCode}.`,
      detail: `${line.description}. The supplier did not price this line; it is absent, not zero.`,
      rfqLineId: line.id,
    }));
}
