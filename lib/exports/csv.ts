import "server-only";
import { loadTruthView } from "@/lib/extraction/truth-view";

/**
 * The comparison as CSV.
 *
 * A blocked cell exports its quoted value AND the basis that blocked it, never
 * an empty field — a buyer opening this in Excel must not be able to sum a
 * column that the product refused to sum.
 */
function escape(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function buildComparisonCsv(rfqId: string): Promise<string | null> {
  const view = await loadTruthView(rfqId);
  if (!view) return null;

  const header = [
    "SKU",
    "Description",
    "Quantity",
    "Unit",
    ...view.vendors.flatMap((v) => [
      `${v.shortLabel} rate (INR)`,
      `${v.shortLabel} status`,
      `${v.shortLabel} as quoted`,
    ]),
  ];

  const rows = view.rows.map((row) => [
    row.skuCode,
    row.description,
    row.quantity,
    row.unit,
    ...view.vendors.flatMap((vendor) => {
      const cell = row.cells.get(vendor.id);
      if (!cell) return ["", "NOT QUOTED", ""];
      return [
        cell.normalizedAmount === null ? "" : cell.normalizedAmount.toFixed(4),
        cell.normalizedAmount === null ? `NOT COMPARABLE (${cell.confidence})` : cell.confidence,
        `${cell.quotedCurrency === "USD" ? "$" : "₹"}${cell.quotedAmount.toFixed(2)} ${cell.quotedUnit}`,
      ];
    }),
  ]);

  const notes = [
    [],
    ["Notes"],
    ["Rates are per unit, normalized to INR."],
    ["An empty rate means the quote could not be safely compared. The status column says why."],
    ["A value shown as NOT QUOTED means the supplier did not price that line. It is not zero."],
    ["USD values converted at a fixed prototype rate, not live market data."],
  ];

  return [header, ...rows, ...notes].map((row) => row.map(escape).join(",")).join("\n");
}
