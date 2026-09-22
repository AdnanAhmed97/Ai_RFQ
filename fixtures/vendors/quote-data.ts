/**
 * What each vendor's document actually says.
 *
 * This is the RAW layer — the numbers and words that will be printed onto the
 * fixture files. It is deliberately not the truth: a price here may be quoted
 * per bundle with no bundle size, may be in the wrong currency, or may be
 * contradicted by a later email. Resolving any of that is the extraction
 * pipeline's job, not this file's.
 *
 * SEED DATA ONLY. Never imported by app or lib code.
 */

import { LINE_ITEMS, type FixtureLineItem } from "../rfx/corrugated-fy27";
import { VENDOR_PROFILES, type VendorKey } from "./profiles";

export interface VendorQuoteLine {
  /** Internal cross-reference. This code does NOT appear in vendor documents. */
  skuCode: string;
  /** The vendor's own item code, as printed. */
  vendorCode: string;
  /** The vendor's own wording for the item, as printed. */
  vendorDescription: string;
  /** The number printed in the rate column. */
  printedPrice: number;
  currency: "INR" | "USD";
  /** The pricing unit as printed, e.g. "per piece", "per bundle", "per 100 pcs". */
  unitLabel: string;
  /**
   * Units per quoted unit, when the document states it somewhere.
   * Undefined means the document is silent — which is the whole point of the
   * unresolvable per-bundle cases.
   */
  packQty?: number;
  /** How the bundle is described in the document, when it is. */
  packLabel?: string;
}

// --- Deterministic per-line jitter -----------------------------------------
// Real quotes are not one multiplier applied uniformly; each vendor is keener
// on some lines than others. This produces that texture reproducibly.

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function jitter(vendorKey: string, skuCode: string): number {
  // ±3.5%, stable for a given (vendor, sku) pair.
  return 1 + (hash(`${vendorKey}:${skuCode}`) - 0.5) * 0.07;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The vendor's true per-unit INR price, before any presentation choices. */
export function unitPriceInr(vendorKey: VendorKey, line: FixtureLineItem): number {
  const profile = VENDOR_PROFILES[vendorKey];
  return round2(line.basePriceInr * profile.priceMultiplier * jitter(vendorKey, line.skuCode));
}

// --- House description styles ----------------------------------------------
// Each vendor writes item descriptions its own way. None of them match the
// RFx wording exactly, and Vendor E says "layer" where the RFx says "ply" —
// the canonical mismatch this product has to handle.

function dims(line: FixtureLineItem): string {
  const s = line.specifications;
  return (
    s["internalDimensionsMm"] ??
    s["dimensionsMm"] ??
    s["blankSizeMm"] ??
    `${s["widthMm"] ?? ""} x ${s["lengthM"] ?? ""}`
  ).replace(/\s/g, "");
}

function plyOf(line: FixtureLineItem): string {
  return line.specifications["ply"] ?? "";
}

function kind(line: FixtureLineItem): string {
  const d = line.description.toLowerCase();
  if (d.includes("mailer")) return "mailer";
  if (d.includes("layer pad")) return "pad";
  if (d.includes("partition")) return "partition";
  if (d.includes("sleeve")) return "sleeve";
  if (d.includes("display tray") || d.includes("tray")) return "tray";
  if (d.includes("edge protector")) return "angle";
  if (d.includes("corner pad")) return "corner";
  if (d.includes("wrapping roll")) return "roll";
  if (d.includes("telescopic")) return "telescopic";
  if (d.includes("hsc")) return "hsc";
  return "rsc";
}

const DESCRIBERS: Record<VendorKey, (line: FixtureLineItem) => string> = {
  // Title case, spells everything out. The tidiest supplier in the set.
  "vendor-a": (l) => {
    const k = kind(l);
    const printed = l.specifications["printing"]?.startsWith("Plain") ? "Plain" : "Printed";
    const base: Record<string, string> = {
      rsc: `${plyOf(l)} Ply RSC Box ${dims(l)} mm - ${printed}`,
      hsc: `${plyOf(l)} Ply HSC Open Top ${dims(l)} mm`,
      telescopic: `${plyOf(l)} Ply Telescopic Lid & Tray ${dims(l)} mm`,
      mailer: `${plyOf(l)} Ply Die Cut Mailer ${dims(l)} mm`,
      pad: `${plyOf(l)} Ply Layer Pad ${dims(l)} mm`,
      partition: `Partition Set ${l.specifications["style"]?.includes("6") ? "6" : "4"} Cell - ${dims(l)} mm`,
      sleeve: `${plyOf(l)} Ply Wrap Around Sleeve ${dims(l)} mm Blank`,
      tray: `${plyOf(l)} Ply Die Cut Tray ${dims(l)} mm`,
      angle: `Edge Protector Angle Board ${dims(l)} mm`,
      corner: `${plyOf(l)} Ply Corner Pad ${dims(l)} mm`,
      roll: `2 Ply Corrugated Roll 1200mm x 75 Mtr`,
    };
    return base[k] ?? l.description;
  },
  // Trade shorthand, flute called out, em-dash separator.
  "vendor-b": (l) => {
    const k = kind(l);
    const flute = l.specifications["flute"] ? ` (${l.specifications["flute"]} Flute)` : "";
    const print = l.specifications["printing"]?.startsWith("Plain") ? "" : " Printed";
    const base: Record<string, string> = {
      rsc: `Corrugated Box ${plyOf(l)}Ply${print} - ${dims(l)}${flute}`,
      hsc: `Corrugated Box ${plyOf(l)}Ply HSC - ${dims(l)}${flute}`,
      telescopic: `Telescopic Box ${plyOf(l)}Ply - ${dims(l)}`,
      mailer: `E-Comm Mailer ${plyOf(l)}Ply - ${dims(l)}`,
      pad: `Corrugated Sheet/Pad ${plyOf(l)}Ply - ${dims(l)}`,
      partition: `Partition ${l.specifications["style"]?.includes("6") ? "6" : "4"} Cavity - ${dims(l)}`,
      sleeve: `Wrap Sleeve ${plyOf(l)}Ply - ${dims(l)}`,
      tray: `Open Tray ${plyOf(l)}Ply - ${dims(l)}`,
      angle: `Angle Board 50x50x1200`,
      corner: `Corner Pad ${plyOf(l)}Ply - ${dims(l)}`,
      roll: `Corrugated Roll 2Ply`,
    };
    return base[k] ?? l.description;
  },
  // ALL CAPS, heavily abbreviated. Typical of an older ERP export.
  "vendor-c": (l) => {
    const k = kind(l);
    const pr = l.specifications["printing"]?.startsWith("Plain") ? "PLN" : "PRTD";
    const base: Record<string, string> = {
      rsc: `${plyOf(l)}PLY RSC ${dims(l).toUpperCase()} ${pr}`,
      hsc: `${plyOf(l)}PLY HSC ${dims(l).toUpperCase()}`,
      telescopic: `${plyOf(l)}PLY TELE SET ${dims(l).toUpperCase()}`,
      mailer: `${plyOf(l)}PLY DC MAILER ${dims(l).toUpperCase()}`,
      pad: `${plyOf(l)}PLY PAD ${dims(l).toUpperCase()}`,
      partition: `PARTITION ${l.specifications["style"]?.includes("6") ? "6" : "4"}CELL ${dims(l).toUpperCase()}`,
      sleeve: `${plyOf(l)}PLY SLEEVE ${dims(l).toUpperCase()}`,
      tray: `${plyOf(l)}PLY TRAY ${dims(l).toUpperCase()}`,
      angle: `ANGLE BOARD 50X50X1200`,
      corner: `${plyOf(l)}PLY CORNER PAD ${dims(l).toUpperCase()}`,
      roll: `2PLY ROLL 1200MM`,
    };
    return base[k] ?? l.description;
  },
  // Lowercase, informal — a quote typed up by hand and then printed.
  "vendor-d": (l) => {
    const k = kind(l);
    const print = l.specifications["printing"]?.startsWith("Plain") ? "" : " printed";
    const base: Record<string, string> = {
      rsc: `${plyOf(l)} ply${print} carton ${dims(l)}`,
      hsc: `${plyOf(l)} ply hsc open top ${dims(l)}`,
      telescopic: `${plyOf(l)} ply telescopic set ${dims(l)}`,
      mailer: `${plyOf(l)} ply mailer box ${dims(l)}`,
      pad: `${plyOf(l)} ply pad ${dims(l)}`,
      partition: `partition ${l.specifications["style"]?.includes("6") ? "6" : "4"} cell ${dims(l)}`,
      sleeve: `${plyOf(l)} ply sleeve ${dims(l)}`,
      tray: `${plyOf(l)} ply tray ${dims(l)}`,
      angle: `angle board 50x50x1200`,
      corner: `${plyOf(l)} ply corner pad ${dims(l)}`,
      roll: `2 ply roll 1200mm`,
    };
    return base[k] ?? l.description;
  },
  // Export house style: "layer" not "ply", slashes not crosses. The wording the
  // spec calls out as the canonical matching problem.
  "vendor-e": (l) => {
    const k = kind(l);
    const d = dims(l).replace(/x/g, "/");
    const print = l.specifications["printing"]?.startsWith("Plain") ? "" : " PRTD";
    const base: Record<string, string> = {
      rsc: `CORR. SHIPPER ${plyOf(l)}-LAYER${print} ${d}MM`,
      hsc: `CORR. HSC ${plyOf(l)}-LAYER ${d}MM`,
      telescopic: `TELESCOPIC SET ${plyOf(l)}-LAYER ${d}MM`,
      mailer: `DIE CUT MAILER ${plyOf(l)}-LAYER ${d}MM`,
      pad: `LAYER SHEET ${plyOf(l)}-LAYER ${d}MM`,
      partition: `CELL PARTITION ${l.specifications["style"]?.includes("6") ? "6" : "4"}-WAY ${d}MM`,
      sleeve: `WRAP SLEEVE ${plyOf(l)}-LAYER ${d}MM`,
      tray: `OPEN TRAY ${plyOf(l)}-LAYER ${d}MM`,
      angle: `EDGE ANGLE 50/50/1200MM`,
      corner: `CORNER PAD ${plyOf(l)}-LAYER ${d}MM`,
      roll: `CORR ROLL 2-LAYER 1200MM`,
    };
    return base[k] ?? l.description;
  },
};

function vendorCode(vendorKey: VendorKey, index: number): string {
  const prefixes: Record<VendorKey, string> = {
    "vendor-a": "PRI",
    "vendor-b": "BW",
    "vendor-c": "CC",
    "vendor-d": "PP",
    "vendor-e": "GP",
  };
  return `${prefixes[vendorKey]}-${String(index + 101).padStart(4, "0")}`;
}

// --- Per-vendor presentation rules -----------------------------------------

/**
 * Vendor B quotes several lines per bundle instead of per piece.
 *
 * Two groups, and the difference between them is the entire point:
 *   - `withStatedPack` prints the bundle quantity, so a per-piece rate is
 *     recoverable by arithmetic.
 *   - `withoutStatedPack` does not, anywhere in the document. Those lines
 *     cannot be normalized by any honest means.
 */
const B_BUNDLE_WITH_PACK: Record<string, number> = {
  "CP-PAD-020": 100,
  "CP-PAD-021": 50,
  "CP-CRN-029": 200,
  "CP-ANG-028": 25,
};
const B_BUNDLE_WITHOUT_PACK = ["CP-3M-006", "CP-3M-007", "CP-TRY-026"];

/** Vendor C quotes the small, high-volume lines per 100 pieces. */
const C_PER_HUNDRED = [
  "CP-3R-001",
  "CP-3R-002",
  "CP-3M-006",
  "CP-3M-007",
  "CP-PAD-020",
  "CP-PAD-021",
  "CP-CRN-029",
  "CP-ANG-028",
];

/** Vendor E prices its export-grade and large lines in dollars. */
const E_USD_LINES = ["CP-7R-018", "CP-5R-013", "CP-5H-016", "CP-5R-012"];

/** The USD rate Vendor E priced at. Not the same as the prototype FX anchor. */
export const VENDOR_E_QUOTE_FX = 84.5;

export function buildVendorLines(vendorKey: VendorKey): VendorQuoteLine[] {
  const profile = VENDOR_PROFILES[vendorKey];
  const describe = DESCRIBERS[vendorKey];

  return LINE_ITEMS.filter((line) => !profile.omittedSkus.includes(line.skuCode)).map(
    (line, index) => {
      const perUnit = unitPriceInr(vendorKey, line);
      const common = {
        skuCode: line.skuCode,
        vendorCode: vendorCode(vendorKey, index),
        vendorDescription: describe(line),
      };

      if (vendorKey === "vendor-b") {
        const packQty = B_BUNDLE_WITH_PACK[line.skuCode];
        if (packQty) {
          return {
            ...common,
            printedPrice: round2(perUnit * packQty),
            currency: "INR" as const,
            unitLabel: "per bundle",
            packQty,
            packLabel: `Bundle of ${packQty}`,
          };
        }
        if (B_BUNDLE_WITHOUT_PACK.includes(line.skuCode)) {
          // Priced per bundle, bundle size stated nowhere. Deliberately unresolvable.
          return {
            ...common,
            printedPrice: round2(perUnit * 50),
            currency: "INR" as const,
            unitLabel: "per bundle",
          };
        }
      }

      if (vendorKey === "vendor-c" && C_PER_HUNDRED.includes(line.skuCode)) {
        return {
          ...common,
          printedPrice: round2(perUnit * 100),
          currency: "INR" as const,
          unitLabel: "per 100 pcs",
          packQty: 100,
          packLabel: "per 100 pcs",
        };
      }

      if (vendorKey === "vendor-e" && E_USD_LINES.includes(line.skuCode)) {
        return {
          ...common,
          printedPrice: round2(perUnit / VENDOR_E_QUOTE_FX),
          currency: "USD" as const,
          unitLabel: "per piece",
        };
      }

      return {
        ...common,
        printedPrice: perUnit,
        currency: "INR" as const,
        unitLabel: line.unit === "set" ? "per set" : line.unit === "roll" ? "per roll" : "per piece",
      };
    },
  );
}

// --- Vendor C's email correction --------------------------------------------

/**
 * Vendor C follows its spreadsheet with an email that revises four lines and
 * introduces a freight charge the spreadsheet never mentioned.
 *
 * The spreadsheet is not reissued. Both documents remain on file saying
 * different things, which is exactly what happens in practice.
 */
export const VENDOR_C_REVISED_SKUS = ["CP-5R-008", "CP-5R-009", "CP-5R-010", "CP-5R-011"];
export const VENDOR_C_REVISION_FACTOR = 0.94;
export const VENDOR_C_FREIGHT_PER_PIECE = 0.85;

export function vendorCRevisedPrice(skuCode: string): number | undefined {
  const line = LINE_ITEMS.find((l) => l.skuCode === skuCode);
  if (!line || !VENDOR_C_REVISED_SKUS.includes(skuCode)) return undefined;
  return round2(unitPriceInr("vendor-c", line) * VENDOR_C_REVISION_FACTOR);
}

// --- Vendor E's handwritten correction ---------------------------------------

/** The line someone struck through in pen on the printed rate card. */
export const VENDOR_E_HANDWRITTEN_SKU = "CP-5R-008";

export function vendorEHandwrittenPrice(): number {
  const line = LINE_ITEMS.find((l) => l.skuCode === VENDOR_E_HANDWRITTEN_SKU)!;
  // Struck-through printed rate, replaced by a lower pen-written one.
  return round2(unitPriceInr("vendor-e", line) * 0.93);
}
