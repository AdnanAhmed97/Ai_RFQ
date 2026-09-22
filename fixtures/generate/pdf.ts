import { createWriteStream } from "node:fs";
import path from "node:path";
import { once } from "node:events";
import PDFDocument from "pdfkit";

import { LINE_ITEMS } from "../rfx/corrugated-fy27";
import { QUESTIONNAIRE } from "../rfx/questionnaire";
import { VENDOR_PROFILES, type VendorKey } from "../vendors/profiles";
import { buildVendorLines } from "../vendors/quote-data";
import { QUESTIONNAIRE_ANSWERS } from "../vendors/questionnaire-answers";
import type { EvidenceRecord, GeneratedDocument } from "./types";
import { PDF_INFO } from "./determinism";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 42;

type Doc = InstanceType<typeof PDFDocument>;

async function render(
  target: string,
  draw: (doc: Doc) => void,
): Promise<void> {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true, info: { ...PDF_INFO } });
  const stream = createWriteStream(target);
  doc.pipe(stream);
  draw(doc);
  doc.end();
  await once(stream, "finish");
}

/** Letterhead shared by the PDF documents. Returns the y to continue from. */
function letterhead(doc: Doc, vendorKey: VendorKey, title: string): number {
  const p = VENDOR_PROFILES[vendorKey];

  doc.font("Helvetica-Bold").fontSize(17).fillColor("#1a3a5c");
  doc.text(`${p.name}`, MARGIN, MARGIN);
  doc.font("Helvetica").fontSize(8).fillColor("#444444");
  doc.text(`${p.legalSuffix}`, MARGIN, doc.y - 2);
  doc.fontSize(8).fillColor("#555555");
  doc.text(p.addressLine, MARGIN, doc.y + 2);
  doc.text(`GSTIN: ${p.gstin}   |   T: ${p.phone}   |   ${p.contactEmail}`);

  const ruleY = doc.y + 6;
  doc.moveTo(MARGIN, ruleY).lineTo(A4.width - MARGIN, ruleY).lineWidth(1.2).strokeColor("#1a3a5c").stroke();

  doc.font("Helvetica-Bold").fontSize(12).fillColor("#000000");
  doc.text(title, MARGIN, ruleY + 14, { width: A4.width - 2 * MARGIN, align: "center" });

  return doc.y + 12;
}

function footerRule(doc: Doc, text: string): void {
  const y = A4.height - MARGIN - 18;
  doc.moveTo(MARGIN, y).lineTo(A4.width - MARGIN, y).lineWidth(0.5).strokeColor("#bbbbbb").stroke();
  doc.font("Helvetica").fontSize(7).fillColor("#888888");
  doc.text(text, MARGIN, y + 5, { width: A4.width - 2 * MARGIN, align: "center" });
}

/**
 * Vendor B's quotation as a letterhead PDF.
 *
 * 27 of 30 lines. Several are priced per bundle: four state the bundle quantity
 * in the description, three do not — and the bundle size for those three appears
 * nowhere in the document, which is the point.
 */
export async function generateVendorBQuotation(root: string): Promise<GeneratedDocument> {
  const profile = VENDOR_PROFILES["vendor-b"];
  const lines = buildVendorLines("vendor-b");
  const evidence: EvidenceRecord[] = [];
  const relativePath = "vendors/vendor-b/quotation.pdf";

  // Column geometry, reused by the header and every row.
  const cols = { sr: MARGIN, code: MARGIN + 26, desc: MARGIN + 86, qty: MARGIN + 310, uom: MARGIN + 368, rate: MARGIN + 452 };
  const rightEdge = A4.width - MARGIN;

  await render(path.join(root, relativePath), (doc) => {
    let y = letterhead(doc, "vendor-b", "QUOTATION — ANNUAL RATE CONTRACT FY27");

    doc.font("Helvetica").fontSize(8.5).fillColor("#000000");
    doc.text(`Quotation No: ${profile.quotationRef}`, MARGIN, y);
    doc.text(`Date: ${profile.quotationDate}`, MARGIN + 300, y);
    y = doc.y + 2;
    doc.text(`Subject: Corrugated packaging — annual requirement, 12 plant locations`, MARGIN, y);
    y = doc.y + 12;

    let page = 1;
    const drawTableHeader = (atY: number): number => {
      doc.rect(MARGIN, atY - 3, rightEdge - MARGIN, 15).fill("#eef1f5");
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#000000");
      doc.text("Sr", cols.sr + 2, atY + 1);
      doc.text("Code", cols.code, atY + 1);
      doc.text("Description", cols.desc, atY + 1);
      doc.text("Qty", cols.qty, atY + 1, { width: 50, align: "right" });
      doc.text("Basis", cols.uom, atY + 1, { width: 76 });
      doc.text("Rate (Rs.)", cols.rate, atY + 1, { width: rightEdge - cols.rate - 2, align: "right" });
      return atY + 17;
    };

    y = drawTableHeader(y);

    lines.forEach((line, i) => {
      const rfxLine = LINE_ITEMS.find((l) => l.skuCode === line.skuCode)!;

      if (y > A4.height - MARGIN - 90) {
        footerRule(doc, `${profile.name} ${profile.legalSuffix} — Quotation ${profile.quotationRef} — Page ${page}`);
        doc.addPage();
        page += 1;
        y = MARGIN;
        y = drawTableHeader(y);
      }

      // The bundle quantity, where stated, is appended to the description —
      // exactly where a real supplier would put it, and nowhere else.
      const description = line.packLabel
        ? `${line.vendorDescription}  [${line.packLabel}]`
        : line.vendorDescription;

      const basis =
        line.unitLabel === "per bundle"
          ? "Per bundle"
          : rfxLine.unit === "set"
            ? "Per set"
            : "Per pc";

      doc.font("Helvetica").fontSize(7.5).fillColor("#000000");
      doc.text(String(i + 1), cols.sr + 2, y);
      doc.text(line.vendorCode, cols.code, y);
      doc.text(description, cols.desc, y, { width: 218 });
      const descBottom = doc.y;
      doc.text(rfxLine.quantity.toLocaleString("en-IN"), cols.qty, y, { width: 50, align: "right" });
      doc.text(basis, cols.uom, y, { width: 76 });
      doc.font("Helvetica-Bold").text(line.printedPrice.toFixed(2), cols.rate, y, {
        width: rightEdge - cols.rate - 2,
        align: "right",
      });

      evidence.push({
        skuCode: line.skuCode,
        field: "quoted_price",
        page,
        sourceText: line.printedPrice.toFixed(2),
      });
      evidence.push({
        skuCode: line.skuCode,
        field: "quoted_unit",
        page,
        sourceText: basis,
      });
      if (line.packLabel) {
        evidence.push({
          skuCode: line.skuCode,
          field: "pack_size",
          page,
          sourceText: line.packLabel,
        });
      }

      y = Math.max(descBottom, y + 10) + 3;
      doc.moveTo(MARGIN, y - 2).lineTo(rightEdge, y - 2).lineWidth(0.3).strokeColor("#dddddd").stroke();
    });

    // --- Terms block ---
    if (y > A4.height - MARGIN - 150) {
      footerRule(doc, `${profile.name} ${profile.legalSuffix} — Quotation ${profile.quotationRef} — Page ${page}`);
      doc.addPage();
      page += 1;
      y = MARGIN;
    }

    y += 10;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000").text("Terms & Conditions", MARGIN, y);
    y = doc.y + 4;

    const terms = [
      profile.freightStatement,
      `Payment: ${profile.paymentTerms}.`,
      `Offer validity: ${profile.validityDays} days from date of quotation.`,
      `Delivery: ${profile.leadTimeDays} days ex-works from confirmed order.`,
      "GST 18% extra as applicable.",
      "Rates subject to revision if kraft paper prices vary by more than 7%.",
    ];
    doc.font("Helvetica").fontSize(8).fillColor("#222222");
    terms.forEach((t, i) => {
      doc.text(`${i + 1}. ${t}`, MARGIN, y, { width: rightEdge - MARGIN });
      if (i === 0) {
        evidence.push({ field: "freight", page, sourceText: `1. ${t}` });
      }
      y = doc.y + 3;
    });

    y += 16;
    doc.font("Helvetica").fontSize(8).text(`For ${profile.name} ${profile.legalSuffix}`, MARGIN, y);
    doc.text(profile.contactName, MARGIN, y + 26);
    doc.fontSize(7).fillColor("#666666").text("Authorised Signatory", MARGIN, y + 36);

    footerRule(doc, `${profile.name} ${profile.legalSuffix} — Quotation ${profile.quotationRef} — Page ${page}`);
  });

  return { relativePath, mimeType: "application/pdf", kind: "PDF", evidence };
}

/** A completed questionnaire as a PDF. Used by vendors A, C, D and E. */
export async function generateQuestionnairePdf(
  root: string,
  vendorKey: VendorKey,
): Promise<GeneratedDocument> {
  const profile = VENDOR_PROFILES[vendorKey];
  const answers = QUESTIONNAIRE_ANSWERS[vendorKey];
  const evidence: EvidenceRecord[] = [];
  const relativePath = `vendors/${vendorKey}/questionnaire.pdf`;
  const rightEdge = A4.width - MARGIN;

  await render(path.join(root, relativePath), (doc) => {
    let y = letterhead(doc, vendorKey, "SUPPLIER QUESTIONNAIRE — CORRUGATED PACKAGING FY27");
    let page = 1;

    doc.font("Helvetica").fontSize(8.5).fillColor("#000000");
    doc.text(`Submitted by: ${profile.contactName}`, MARGIN, y);
    doc.text(`Date: ${profile.quotationDate}`, MARGIN + 300, y);
    y = doc.y + 14;

    QUESTIONNAIRE.forEach((question) => {
      const answer = answers.find((a) => a.ref === question.ref);
      if (!answer) return;

      if (y > A4.height - MARGIN - 110) {
        footerRule(doc, `${profile.name} — Supplier Questionnaire — Page ${page}`);
        doc.addPage();
        page += 1;
        y = MARGIN;
      }

      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#1a3a5c");
      doc.text(`${question.ref}.`, MARGIN, y, { width: 22 });
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#000000");
      doc.text(question.question, MARGIN + 24, y, { width: rightEdge - MARGIN - 24 });
      y = doc.y + 3;

      doc.font("Helvetica").fontSize(8.5).fillColor("#1a1a1a");
      doc.text(answer.answerText, MARGIN + 24, y, { width: rightEdge - MARGIN - 24 });
      y = doc.y + 10;

      evidence.push({
        field: `questionnaire:${question.ref}`,
        page,
        sourceText: answer.answerText,
      });
    });

    y += 10;
    doc.font("Helvetica").fontSize(8).fillColor("#000000");
    doc.text(`For ${profile.name} ${profile.legalSuffix}`, MARGIN, y);
    doc.text(profile.contactName, MARGIN, y + 24);
    doc.fontSize(7).fillColor("#666666").text("Authorised Signatory", MARGIN, y + 34);

    footerRule(doc, `${profile.name} — Supplier Questionnaire — Page ${page}`);
  });

  return { relativePath, mimeType: "application/pdf", kind: "PDF", evidence };
}

/** Vendor A's separate commercial terms sheet. */
export async function generateVendorATerms(root: string): Promise<GeneratedDocument> {
  const profile = VENDOR_PROFILES["vendor-a"];
  const evidence: EvidenceRecord[] = [];
  const relativePath = "vendors/vendor-a/terms.pdf";
  const rightEdge = A4.width - MARGIN;

  await render(path.join(root, relativePath), (doc) => {
    let y = letterhead(doc, "vendor-a", "COMMERCIAL TERMS — ANNUAL RATE CONTRACT FY27");

    doc.font("Helvetica").fontSize(8.5).fillColor("#000000");
    doc.text(`Reference: ${profile.quotationRef}`, MARGIN, y);
    doc.text(`Date: ${profile.quotationDate}`, MARGIN + 300, y);
    y = doc.y + 14;

    const sections: { heading: string; body: string; field?: string }[] = [
      {
        heading: "1. Price basis",
        body:
          "All rates quoted in the accompanying quotation are per piece in Indian Rupees, " +
          "except where the line explicitly states a set or roll. Rates exclude GST.",
      },
      {
        heading: "2. Freight and delivery",
        body:
          profile.freightStatement +
          " Delivery is to the twelve nominated plant locations. No separate freight, " +
          "handling or unloading charge will be raised against these rates.",
        field: "freight",
      },
      {
        heading: "3. Payment",
        body: `${profile.paymentTerms}. Invoices raised against despatch documentation and a signed delivery challan.`,
        field: "payment_terms",
      },
      {
        heading: "4. Validity",
        body: `This offer is valid for ${profile.validityDays} days from the date above. Rates are firm for the contract year once accepted.`,
      },
      {
        heading: "5. Lead time",
        body: `${profile.leadTimeDays} days from receipt of a firm purchase order. Schedules may be called off against a rolling forecast.`,
      },
      {
        heading: "6. Quality",
        body:
          "All containers conform to IS 2771 (Part 1). A bursting-strength test certificate " +
          "per IS 7028 accompanies every despatched batch. Material not meeting the agreed " +
          "specification will be replaced at our cost within 7 working days.",
      },
      {
        heading: "7. Price revision",
        body:
          "Rates are linked to the kraft paper index. A revision may be sought only if the " +
          "index moves by more than 8% from the level at the date of this offer, and requires " +
          "30 days written notice.",
      },
    ];

    sections.forEach((section) => {
      if (y > A4.height - MARGIN - 110) {
        footerRule(doc, `${profile.name} — Commercial Terms — ${profile.quotationRef}`);
        doc.addPage();
        y = MARGIN;
      }
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#1a3a5c").text(section.heading, MARGIN, y);
      y = doc.y + 3;
      doc.font("Helvetica").fontSize(8.5).fillColor("#1a1a1a").text(section.body, MARGIN, y, {
        width: rightEdge - MARGIN,
        align: "justify",
      });
      y = doc.y + 11;

      if (section.field) {
        evidence.push({ field: section.field, page: 1, sourceText: section.body });
      }
    });

    footerRule(doc, `${profile.name} — Commercial Terms — ${profile.quotationRef}`);
  });

  return { relativePath, mimeType: "application/pdf", kind: "PDF", evidence };
}
