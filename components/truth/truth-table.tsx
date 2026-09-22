"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { TruthCell, TruthView } from "@/lib/extraction/truth-view";
import { EvidenceDrawer } from "./evidence-drawer";

/**
 * The comparison: 30 lines across 5 suppliers, read as one surface.
 *
 * A cell that could not be normalized keeps its quoted value struck through and
 * shows the basis that blocked it — an empty square would hide the most
 * important fact on the row. The cheapest comparable cell carries a left mark,
 * so the eye can run down a column without reading every figure.
 */
const CONFIDENCE_CLASS: Record<string, string> = {
  VERIFIED: "",
  INFERRED: "text-inferred",
  REVIEW_REQUIRED: "text-review",
  BLOCKED: "text-blocked",
  CONFLICT: "text-conflict",
};

export function TruthTable({ view }: { view: TruthView }) {
  const [open, setOpen] = useState<{ cell: TruthCell; row: (typeof view.rows)[number] } | null>(
    null,
  );

  return (
    <>
      <div className="overflow-x-auto">
        <table className="grid-table min-w-[68rem]">
          <thead>
            <tr>
              <th className="w-[22rem]">Line</th>
              <th className="w-20 text-right">Qty</th>
              {view.vendors.map((vendor) => (
                <th key={vendor.id} className="w-28 text-right">
                  <span className={cn(vendor.eligible === false && "text-conflict")}>
                    {vendor.shortLabel}
                  </span>
                  {vendor.eligible === false ? (
                    <span className="ink-3 block text-micro font-normal">not eligible</span>
                  ) : vendor.eligible === null ? (
                    <span className="ink-3 block text-micro font-normal">unreviewed</span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.rfqLineId}>
                <td>
                  <span className="num ink-3 mr-2">{row.skuCode}</span>
                  <span className="ink-2">{row.description}</span>
                </td>
                <td className="num ink-3 text-right">{row.quantity.toLocaleString("en-IN")}</td>
                {view.vendors.map((vendor) => {
                  const cell = row.cells.get(vendor.id);
                  if (!cell) {
                    return (
                      <td key={vendor.id} className="text-right">
                        <span className="ink-3" title="This supplier did not quote this line">
                          —
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td key={vendor.id} className="p-0 text-right">
                      <button
                        type="button"
                        onClick={() => setOpen({ cell, row })}
                        className={cn(
                          "relative block w-full px-3.5 py-2.5 text-right transition-colors hover:bg-gr-880",
                          CONFIDENCE_CLASS[cell.confidence],
                        )}
                        title={cell.derivation ?? undefined}
                      >
                        {cell.lowest ? (
                          <span
                            aria-hidden
                            className="absolute inset-y-1 left-0 w-0.5 bg-verified"
                          />
                        ) : null}
                        {cell.normalizedAmount === null ? (
                          <>
                            <span className="num line-through opacity-55">
                              {cell.quotedCurrency === "USD" ? "$" : "₹"}
                              {cell.quotedAmount.toFixed(2)}
                            </span>
                            <span className="ink-3 block text-micro">{cell.quotedUnit}</span>
                          </>
                        ) : (
                          <>
                            <span className="num">₹{cell.normalizedAmount.toFixed(2)}</span>
                            {cell.freightStatus !== "INCLUDED" ? (
                              <span className="ink-3 block text-micro">
                                {cell.freightStatus === "EXTRA" ? "+freight" : "freight ?"}
                              </span>
                            ) : null}
                          </>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? (
        <EvidenceDrawer
          cell={open.cell}
          line={{ skuCode: open.row.skuCode, description: open.row.description, unit: open.row.unit }}
          vendor={view.vendors.find((v) => v.id === open.cell.vendorId)!}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}
