import { writeFile } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";

import { LINE_ITEMS } from "../rfx/corrugated-fy27";
import { VENDOR_PROFILES } from "../vendors/profiles";
import { buildVendorLines } from "../vendors/quote-data";
import type { EvidenceRecord, GeneratedDocument } from "./types";
import { PAGE, degradeAsScan, line, newPage } from "./imaging";
import { PDF_INFO } from "./determinism";

/**
 * Lines whose rate was printed with tired toner.
 *
 * After the scan degradation these digits are genuinely ambiguous — a 6 that
 * could be an 8, a 3 that could be a 9. That is the intended difficulty: the
 * extraction model should mark them for review rather than commit to a reading.
 */
const FADED_RATE_SKUS = ["CP-5R-011", "CP-3M-007", "CP-TRY-027"];

/**
 * Vendor D's quotation: printed, signed, and run through the office scanner.
 *
 * The freight condition is at the foot of the page in small type, which is
 * where it would be — and it is conditional on distance, so it does not resolve
 * to "included" or "extra" without knowing where each plant is.
 */
export async function generateVendorDScannedQuotation(
  root: string,
): Promise<GeneratedDocument> {
  const profile = VENDOR_PROFILES["vendor-d"];
  const lines = buildVendorLines("vendor-d");
  const evidence: EvidenceRecord[] = [];

  // Two scanned pages: 18 lines on the first, the remainder plus terms on the second.
  const PER_PAGE = 18;
  const chunks = [lines.slice(0, PER_PAGE), lines.slice(PER_PAGE)];
  const scans: Buffer[] = [];

  for (const [pageIndex, chunk] of chunks.entries()) {
    const { canvas, ctx } = newPage("#fdfdfb");
    const M = 110;
    let y = 150;

    // --- Letterhead, as printed ---
    line(ctx, profile.name.toUpperCase(), M, y, { font: "bold 44px Helvetica", color: "#16232e" });
    y += 34;
    line(ctx, profile.legalSuffix, M, y, { font: "22px Helvetica", color: "#3a3a3a" });
    y += 32;
    line(ctx, profile.addressLine, M, y, { font: "21px Helvetica", color: "#3a3a3a" });
    y += 28;
    line(ctx, `GSTIN: ${profile.gstin}    Tel: ${profile.phone}`, M, y, {
      font: "21px Helvetica",
      color: "#3a3a3a",
    });
    y += 22;

    ctx.strokeStyle = "#16232e";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(M, y);
    ctx.lineTo(PAGE.width - M, y);
    ctx.stroke();
    y += 52;

    line(ctx, "QUOTATION", PAGE.width / 2, y, {
      font: "bold 32px Helvetica",
      align: "center",
    });
    y += 44;
    line(ctx, "ANNUAL RATE CONTRACT - CORRUGATED PACKAGING FY 2026-27", PAGE.width / 2, y, {
      font: "22px Helvetica",
      align: "center",
      color: "#2a2a2a",
    });
    y += 46;

    line(ctx, `Quotation No.: ${profile.quotationRef}`, M, y, { font: "22px Helvetica" });
    line(ctx, `Date: ${profile.quotationDate}`, PAGE.width - M, y, {
      font: "22px Helvetica",
      align: "right",
    });
    y += 30;
    line(ctx, `Page ${pageIndex + 1} of ${chunks.length}`, PAGE.width - M, y, {
      font: "20px Helvetica",
      align: "right",
      color: "#4a4a4a",
    });
    y += 38;

    // --- Table ---
    const col = { sr: M + 6, code: M + 70, desc: M + 220, qty: M + 900, uom: M + 1060, rate: PAGE.width - M - 10 };

    ctx.fillStyle = "#e9ecef";
    ctx.fillRect(M, y - 26, PAGE.width - 2 * M, 38);
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 1.4;
    ctx.strokeRect(M, y - 26, PAGE.width - 2 * M, 38);

    line(ctx, "Sr", col.sr, y, { font: "bold 21px Helvetica" });
    line(ctx, "Code", col.code, y, { font: "bold 21px Helvetica" });
    line(ctx, "Item Description", col.desc, y, { font: "bold 21px Helvetica" });
    line(ctx, "Qty", col.qty + 120, y, { font: "bold 21px Helvetica", align: "right" });
    line(ctx, "UOM", col.uom, y, { font: "bold 21px Helvetica" });
    line(ctx, "Rate (Rs.)", col.rate, y, { font: "bold 21px Helvetica", align: "right" });
    y += 40;

    for (const [i, quoteLine] of chunk.entries()) {
      const rfxLine = LINE_ITEMS.find((l) => l.skuCode === quoteLine.skuCode)!;
      const srNumber = pageIndex * PER_PAGE + i + 1;
      const faded = FADED_RATE_SKUS.includes(quoteLine.skuCode);

      line(ctx, String(srNumber), col.sr, y, { font: "21px Helvetica" });
      line(ctx, quoteLine.vendorCode, col.code, y, { font: "21px Helvetica" });
      line(ctx, quoteLine.vendorDescription, col.desc, y, { font: "21px Helvetica", maxWidth: 660 });
      line(ctx, rfxLine.quantity.toLocaleString("en-IN"), col.qty + 120, y, {
        font: "21px Helvetica",
        align: "right",
      });
      line(ctx, rfxLine.unit === "set" ? "Set" : rfxLine.unit === "roll" ? "Roll" : "Nos", col.uom, y, {
        font: "21px Helvetica",
      });

      // A faded rate is printed lighter and a touch off-baseline, as if the
      // drum skipped. After degradation these are the hard ones.
      line(ctx, quoteLine.printedPrice.toFixed(2), col.rate, faded ? y + 1 : y, {
        font: faded ? "21px Helvetica" : "bold 21px Helvetica",
        align: "right",
        color: faded ? "#9a9a9a" : "#141414",
      });

      evidence.push({
        skuCode: quoteLine.skuCode,
        field: "quoted_price",
        page: pageIndex + 1,
        row: srNumber,
        sourceText: quoteLine.printedPrice.toFixed(2),
      });

      ctx.strokeStyle = "#cfcfcf";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(M, y + 12);
      ctx.lineTo(PAGE.width - M, y + 12);
      ctx.stroke();
      y += 40;
    }

    // --- Footer terms, small type, last page only ---
    if (pageIndex === chunks.length - 1) {
      y += 34;
      line(ctx, "Terms:", M, y, { font: "bold 20px Helvetica" });
      y += 28;

      const terms = [
        profile.freightStatement,
        `Payment: ${profile.paymentTerms}. Validity: ${profile.validityDays} days.`,
        `Delivery: ${profile.leadTimeDays} days from PO. GST 18% extra.`,
        "Bursting strength certificate as per IS 7028 provided with each batch.",
      ];

      for (const [ti, term] of terms.entries()) {
        // Small type, wrapped by hand — the freight condition is the first item
        // and reads as boilerplate at this size.
        const words = term.split(" ");
        let current = "";
        for (const word of words) {
          const candidate = current ? `${current} ${word}` : word;
          ctx.font = "17px Helvetica";
          if (ctx.measureText(`${ti + 1}. ${candidate}`).width > PAGE.width - 2 * M - 20) {
            line(ctx, `${current}`, M + (current === term.split(" ")[0] ? 0 : 26), y, {
              font: "17px Helvetica",
              color: "#2b2b2b",
            });
            y += 24;
            current = word;
          } else {
            current = candidate;
          }
        }
        line(ctx, `${ti + 1}. ${current}`, M, y, { font: "17px Helvetica", color: "#2b2b2b" });
        y += 26;

        if (ti === 0) {
          evidence.push({
            field: "freight",
            page: pageIndex + 1,
            sourceText: profile.freightStatement,
          });
        }
      }

      y += 50;
      line(ctx, `For ${profile.name} ${profile.legalSuffix}`, M, y, { font: "21px Helvetica" });
      y += 70;
      // A signature scrawl, drawn rather than typeset.
      ctx.strokeStyle = "#1b3a6b";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(M + 10, y);
      ctx.bezierCurveTo(M + 60, y - 42, M + 96, y + 26, M + 150, y - 14);
      ctx.bezierCurveTo(M + 188, y - 42, M + 210, y + 18, M + 268, y - 6);
      ctx.stroke();
      y += 34;
      line(ctx, profile.contactName, M, y, { font: "20px Helvetica" });
      y += 26;
      line(ctx, "Authorised Signatory", M, y, { font: "18px Helvetica", color: "#555555" });
    }

    scans.push(await degradeAsScan(canvas.toBuffer("image/png"), 40404 + pageIndex));
  }

  // --- Wrap the scanned images in a PDF, as a scan-to-PDF device would ---
  const pdf = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false, info: { ...PDF_INFO } });
  const buffers: Buffer[] = [];
  pdf.on("data", (chunk: Buffer) => buffers.push(chunk));
  const done = new Promise<void>((resolve) => pdf.on("end", () => resolve()));

  for (const scan of scans) {
    pdf.addPage({ size: "A4", margin: 0 });
    pdf.image(scan, 0, 0, { width: 595.28, height: 841.89 });
  }
  pdf.end();
  await done;

  const relativePath = "vendors/vendor-d/scanned-quotation.pdf";
  await writeFile(path.join(root, relativePath), Buffer.concat(buffers));

  return { relativePath, mimeType: "application/pdf", kind: "PDF", evidence };
}

export { FADED_RATE_SKUS };
