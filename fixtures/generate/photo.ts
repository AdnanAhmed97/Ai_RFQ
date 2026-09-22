import { writeFile } from "node:fs/promises";
import path from "node:path";

import { LINE_ITEMS } from "../rfx/corrugated-fy27";
import { VENDOR_PROFILES } from "../vendors/profiles";
import {
  VENDOR_E_HANDWRITTEN_SKU,
  buildVendorLines,
  vendorEHandwrittenPrice,
} from "../vendors/quote-data";
import type { EvidenceRecord, GeneratedDocument } from "./types";
import { PAGE, degradeAsPhotograph, line, newPage } from "./imaging";

/**
 * Vendor E's rate card, photographed on a desk rather than scanned or emailed.
 *
 * Three things make this the hardest document in the set, and all three are
 * ordinary: some lines are priced in dollars because this is an export house,
 * someone has struck through a printed rate and written a lower one in pen, and
 * the freight line says "As applicable", which says nothing at all. A margin
 * note in the same pen asks the question the buyer will also be asking.
 */
export async function generateVendorEPhotoRateCard(root: string): Promise<GeneratedDocument> {
  const profile = VENDOR_PROFILES["vendor-e"];
  const lines = buildVendorLines("vendor-e");
  const evidence: EvidenceRecord[] = [];

  // Slightly warm stock — a printed card, not copier paper.
  const { canvas, ctx } = newPage("#f7f4ed");
  const M = 96;
  let y = 132;

  // --- Printed header ---
  line(ctx, profile.name.toUpperCase(), M, y, { font: "bold 46px Helvetica", color: "#123049" });
  y += 36;
  line(ctx, profile.legalSuffix.toUpperCase(), M, y, { font: "22px Helvetica", color: "#3d3d3d" });
  y += 30;
  line(ctx, profile.addressLine, M, y, { font: "20px Helvetica", color: "#3d3d3d" });
  y += 26;
  line(ctx, `GSTIN ${profile.gstin}   |   ${profile.phone}   |   ${profile.contactEmail}`, M, y, {
    font: "19px Helvetica",
    color: "#4a4a4a",
  });
  y += 20;

  ctx.strokeStyle = "#123049";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(M, y);
  ctx.lineTo(PAGE.width - M, y);
  ctx.stroke();
  y += 50;

  line(ctx, "RATE CARD 2026-27", PAGE.width / 2, y, { font: "bold 34px Helvetica", align: "center" });
  y += 38;
  line(ctx, "CORRUGATED PACKAGING - DOMESTIC & EXPORT GRADES", PAGE.width / 2, y, {
    font: "20px Helvetica",
    align: "center",
    color: "#2e2e2e",
  });
  y += 34;
  line(ctx, `Ref ${profile.quotationRef}      Dated ${profile.quotationDate}`, PAGE.width / 2, y, {
    font: "19px Helvetica",
    align: "center",
    color: "#4a4a4a",
  });
  y += 44;

  // --- Rate table ---
  const col = { sr: M + 4, desc: M + 70, uom: M + 840, rate: PAGE.width - M - 8 };

  ctx.fillStyle = "#e4e0d6";
  ctx.fillRect(M, y - 24, PAGE.width - 2 * M, 34);
  line(ctx, "Sr", col.sr, y, { font: "bold 20px Helvetica" });
  line(ctx, "Item", col.desc, y, { font: "bold 20px Helvetica" });
  line(ctx, "Basis", col.uom, y, { font: "bold 20px Helvetica" });
  line(ctx, "Rate", col.rate, y, { font: "bold 20px Helvetica", align: "right" });
  y += 36;

  let handwrittenAnchorY = 0;
  let handwrittenAnchorX = 0;

  for (const [i, quoteLine] of lines.entries()) {
    const rfxLine = LINE_ITEMS.find((l) => l.skuCode === quoteLine.skuCode)!;
    const isHandCorrected = quoteLine.skuCode === VENDOR_E_HANDWRITTEN_SKU;

    line(ctx, String(i + 1), col.sr, y, { font: "19px Helvetica" });
    line(ctx, quoteLine.vendorDescription, col.desc, y, { font: "19px Helvetica", maxWidth: 740 });
    line(ctx, rfxLine.unit === "set" ? "PER SET" : "PER PC", col.uom, y, {
      font: "19px Helvetica",
      color: "#333333",
    });

    // Currency is marked only by the symbol in the rate column. Nothing else on
    // the card says which lines are in dollars.
    const printedRate =
      quoteLine.currency === "USD"
        ? `$ ${quoteLine.printedPrice.toFixed(2)}`
        : quoteLine.printedPrice.toFixed(2);

    line(ctx, printedRate, col.rate, y, { font: "bold 20px Helvetica", align: "right" });

    evidence.push({
      skuCode: quoteLine.skuCode,
      field: "quoted_price",
      page: 1,
      row: i + 1,
      sourceText: printedRate,
    });
    if (quoteLine.currency === "USD") {
      evidence.push({
        skuCode: quoteLine.skuCode,
        field: "currency",
        page: 1,
        row: i + 1,
        sourceText: printedRate,
      });
    }

    if (isHandCorrected) {
      handwrittenAnchorY = y;
      handwrittenAnchorX = col.rate;
    }

    ctx.strokeStyle = "#d6d2c7";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(M, y + 11);
    ctx.lineTo(PAGE.width - M, y + 11);
    ctx.stroke();
    y += 36;
  }

  // --- Printed terms ---
  y += 30;
  line(ctx, "Terms", M, y, { font: "bold 20px Helvetica" });
  y += 30;
  const terms = [
    profile.freightStatement,
    `Payment: ${profile.paymentTerms}.`,
    `Validity: ${profile.validityDays} days from date of this card.`,
    `Delivery: ${profile.leadTimeDays} days ex-works Mumbai.`,
    "Export grades quoted in USD. INR conversion at prevailing rate on date of invoice.",
    "GST extra as applicable on domestic supply.",
  ];
  let freightLineY = 0;
  for (const [ti, term] of terms.entries()) {
    line(ctx, `${ti + 1}. ${term}`, M, y, { font: "18px Helvetica", color: "#2b2b2b" });
    if (ti === 0) {
      freightLineY = y;
      evidence.push({ field: "freight", page: 1, sourceText: term });
    }
    if (ti === 4) {
      evidence.push({ field: "currency_terms", page: 1, sourceText: term });
    }
    y += 28;
  }

  // --- Pen annotations, over the printed card ---
  const ink = "#1c3f8f";
  const corrected = vendorEHandwrittenPrice();

  // Measure the printed rate so the strike covers that value and nothing else.
  // A stroke sized by guesswork lands on the row above, which reads as damage
  // rather than as a correction.
  const struckLine = lines.find((l) => l.skuCode === VENDOR_E_HANDWRITTEN_SKU)!;
  ctx.font = "bold 20px Helvetica";
  const struckWidth = ctx.measureText(struckLine.printedPrice.toFixed(2)).width;
  const struckLeft = handwrittenAnchorX - struckWidth;

  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(struckLeft - 8, handwrittenAnchorY - 4);
  ctx.bezierCurveTo(
    struckLeft + struckWidth * 0.3,
    handwrittenAnchorY - 9,
    struckLeft + struckWidth * 0.7,
    handwrittenAnchorY - 2,
    handwrittenAnchorX + 6,
    handwrittenAnchorY - 7,
  );
  ctx.stroke();

  // The replacement sits to the left of what it replaces, on the same line —
  // where a hand would write it, in the white space before the rate column.
  ctx.save();
  ctx.translate(struckLeft - 150, handwrittenAnchorY + 4);
  ctx.rotate(-0.05);
  line(ctx, corrected.toFixed(2), 0, 0, { font: "38px Bradley Hand", color: ink });
  ctx.restore();

  // A caret tying the written figure to the struck one.
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(struckLeft - 30, handwrittenAnchorY - 2);
  ctx.lineTo(struckLeft - 16, handwrittenAnchorY - 12);
  ctx.lineTo(struckLeft - 10, handwrittenAnchorY - 2);
  ctx.stroke();

  evidence.push({
    skuCode: VENDOR_E_HANDWRITTEN_SKU,
    field: "quoted_price_handwritten",
    page: 1,
    sourceText: corrected.toFixed(2),
  });

  // A margin note in the same pen, next to the freight line.
  ctx.save();
  ctx.translate(M + 470, freightLineY + 6);
  ctx.rotate(-0.04);
  line(ctx, "to each plant?", 0, 0, { font: "30px Bradley Hand", color: ink });
  ctx.restore();

  // And an arrow from the note back to the freight clause.
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(M + 462, freightLineY);
  ctx.lineTo(M + 300, freightLineY - 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(M + 300, freightLineY - 4);
  ctx.lineTo(M + 318, freightLineY - 13);
  ctx.moveTo(M + 300, freightLineY - 4);
  ctx.lineTo(M + 320, freightLineY + 5);
  ctx.stroke();

  evidence.push({
    field: "freight_handwritten_query",
    page: 1,
    sourceText: "to each plant?",
  });

  const jpeg = await degradeAsPhotograph(canvas.toBuffer("image/png"), 90210);
  const relativePath = "vendors/vendor-e/photographed-rate-card.jpg";
  await writeFile(path.join(root, relativePath), jpeg);

  return { relativePath, mimeType: "image/jpeg", kind: "IMAGE", evidence };
}
