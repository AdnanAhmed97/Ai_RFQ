"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { ConfidenceBadge, confidenceMeaning } from "./confidence-badge";
import type { TruthCell } from "@/lib/extraction/truth-view";
import type { ConfidenceState } from "@/types";

/**
 * Where a number came from.
 *
 * The one screen the whole product exists to make possible: the value, the
 * original, the arithmetic that connects them, and the document, page and cell
 * it was read from. A value that cannot fill this panel should not be on screen.
 */
export function EvidenceDrawer({
  cell,
  line,
  vendor,
  onClose,
}: {
  cell: TruthCell;
  line: { skuCode: string; description: string; unit: string };
  vendor: { shortLabel: string; name: string };
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close evidence"
        onClick={onClose}
        className="flex-1 bg-gr-960/55"
      />
      <aside
        className="panel rule-l flex w-[26rem] flex-col overflow-y-auto border-l"
        aria-label={`Evidence for ${line.skuCode}, ${vendor.shortLabel}`}
      >
        <header className="bar sticky top-0 flex items-center gap-3 px-4">
          <div className="min-w-0 flex-1">
            <p className="num truncate text-xs">{line.skuCode}</p>
            <p className="ink-3 truncate text-micro">{vendor.shortLabel} · {vendor.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ink-3 hover:text-gr-100 -m-1 rounded-xs p-1 transition-colors"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </header>

        <dl className="px-4 py-4">
          <dt className="label">Comparable value</dt>
          <dd className="num mt-1 text-lg">
            {cell.normalizedAmount === null ? (
              <span className="text-blocked">Cannot be compared</span>
            ) : (
              <>
                ₹{cell.normalizedAmount.toFixed(2)}
                <span className="ink-3 ml-1.5 text-xs">per {line.unit}</span>
              </>
            )}
          </dd>

          <dt className="label mt-5">As quoted</dt>
          <dd className="num mt-1">
            {cell.quotedCurrency === "USD" ? "$" : "₹"}
            {cell.quotedAmount.toFixed(2)}
            <span className="ink-3 ml-1.5 text-xs">{cell.quotedUnit}</span>
          </dd>

          {cell.derivation ? (
            <>
              <dt className="label mt-5">
                {cell.normalizedAmount === null ? "Why it cannot be compared" : "How it was derived"}
              </dt>
              <dd className="ink-2 mt-1 text-xs">{cell.derivation}</dd>
            </>
          ) : null}

          <dt className="label mt-5">Freight</dt>
          <dd className="ink-2 mt-1 text-xs">
            {cell.freightStatus === "INCLUDED"
              ? "Included in the quoted rate."
              : cell.freightStatus === "EXTRA"
                ? "Charged extra by this supplier."
                : "Not stated. Landed cost is unresolved."}
          </dd>

          <dt className="label mt-5">Source</dt>
          <dd className="mt-1 text-xs">
            {cell.evidence ? (
              <>
                <span className="ink-2 block">
                  {cell.evidence.documentName}
                  {cell.evidence.sheet ? `, ${cell.evidence.sheet}` : ""}
                  {cell.evidence.page ? `, page ${cell.evidence.page}` : ""}
                  {cell.evidence.row ? `, row ${cell.evidence.row}` : ""}
                  {cell.evidence.column ? `, column ${cell.evidence.column}` : ""}
                </span>
                {cell.evidence.sourceText ? (
                  <span className="rule-l mt-2 block border-l pl-3 text-gr-300">
                    {cell.evidence.sourceText}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="ink-3">No source reference recorded.</span>
            )}
          </dd>

          <dt className="label mt-5">Confidence</dt>
          <dd className="mt-1.5">
            <ConfidenceBadge state={cell.confidence as ConfidenceState} />
            <p className="ink-3 mt-1.5 text-xs">
              {confidenceMeaning(cell.confidence as ConfidenceState)}
            </p>
          </dd>
        </dl>
      </aside>
    </div>
  );
}
