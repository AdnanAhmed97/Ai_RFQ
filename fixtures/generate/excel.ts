import { writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

import { LINE_ITEMS } from "../rfx/corrugated-fy27";
import { VENDOR_PROFILES } from "../vendors/profiles";
import { buildVendorLines } from "../vendors/quote-data";
import type { EvidenceRecord, GeneratedDocument } from "./types";
import { FIXTURE_EPOCH, stabilizeOoxml } from "./determinism";

const HEADER_FILL = "FFF2F2F2";

/**
 * Vendor A's quotation: a tidy, well-formatted workbook from a supplier with a
 * decent ERP. Everything per piece, freight stated plainly in the notes block.
 */
export async function generateVendorAQuotation(root: string): Promise<GeneratedDocument> {
  const profile = VENDOR_PROFILES["vendor-a"];
  const lines = buildVendorLines("vendor-a");
  const evidence: EvidenceRecord[] = [];

  const wb = new ExcelJS.Workbook();
  wb.creator = `${profile.name} ${profile.legalSuffix}`;
  wb.created = FIXTURE_EPOCH;
  wb.modified = FIXTURE_EPOCH;
  const ws = wb.addWorksheet("Quotation", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true },
  });

  ws.columns = [
    { key: "sr", width: 6 },
    { key: "code", width: 14 },
    { key: "desc", width: 52 },
    { key: "qty", width: 12 },
    { key: "uom", width: 10 },
    { key: "rate", width: 14 },
    { key: "amount", width: 16 },
  ];

  // --- Letterhead block ---
  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = `${profile.name} ${profile.legalSuffix}`;
  ws.getCell("A1").font = { size: 16, bold: true, color: { argb: "FF1F3864" } };
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.getRow(1).height = 24;

  ws.mergeCells("A2:G2");
  ws.getCell("A2").value = profile.addressLine;
  ws.getCell("A2").alignment = { horizontal: "center" };
  ws.getCell("A2").font = { size: 9 };

  ws.mergeCells("A3:G3");
  ws.getCell("A3").value = `GSTIN: ${profile.gstin}  |  Tel: ${profile.phone}  |  ${profile.contactEmail}`;
  ws.getCell("A3").alignment = { horizontal: "center" };
  ws.getCell("A3").font = { size: 9, color: { argb: "FF595959" } };

  ws.mergeCells("A5:G5");
  ws.getCell("A5").value = "QUOTATION — CORRUGATED PACKAGING, FY27 ANNUAL RATE CONTRACT";
  ws.getCell("A5").font = { size: 12, bold: true };
  ws.getCell("A5").alignment = { horizontal: "center" };

  ws.getCell("A7").value = "Quotation Ref:";
  ws.getCell("B7").value = profile.quotationRef;
  ws.getCell("E7").value = "Date:";
  ws.getCell("F7").value = profile.quotationDate;
  ws.getCell("A8").value = "Prepared by:";
  ws.getCell("B8").value = profile.contactName;
  ws.getCell("E8").value = "Validity:";
  ws.getCell("F8").value = `${profile.validityDays} days`;
  for (const ref of ["A7", "E7", "A8", "E8"]) ws.getCell(ref).font = { bold: true, size: 10 };

  // --- Table header ---
  const HEADER_ROW = 10;
  const headers = ["Sr.", "Item Code", "Description", "Annual Qty", "UOM", "Rate (INR)", "Amount (INR)"];
  const headerRow = ws.getRow(HEADER_ROW);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "medium" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
    cell.alignment = { vertical: "middle", horizontal: i >= 3 ? "right" : "left" };
  });
  headerRow.height = 20;

  // --- Line rows ---
  lines.forEach((line, i) => {
    const rfxLine = LINE_ITEMS.find((l) => l.skuCode === line.skuCode)!;
    const rowNumber = HEADER_ROW + 1 + i;
    const row = ws.getRow(rowNumber);
    const amount = Math.round(line.printedPrice * rfxLine.quantity * 100) / 100;

    row.getCell(1).value = i + 1;
    row.getCell(2).value = line.vendorCode;
    row.getCell(3).value = line.vendorDescription;
    row.getCell(4).value = rfxLine.quantity;
    row.getCell(5).value = rfxLine.unit === "set" ? "Set" : rfxLine.unit === "roll" ? "Roll" : "Nos";
    row.getCell(6).value = line.printedPrice;
    row.getCell(7).value = amount;

    row.getCell(4).numFmt = "#,##0";
    row.getCell(6).numFmt = "#,##0.00";
    row.getCell(7).numFmt = "#,##0.00";
    row.font = { size: 10 };
    for (let c = 1; c <= 7; c++) {
      row.getCell(c).border = {
        top: { style: "hair" },
        bottom: { style: "hair" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
    }

    evidence.push({
      skuCode: line.skuCode,
      field: "quoted_price",
      sheet: "Quotation",
      row: rowNumber,
      column: "F",
      sourceText: line.printedPrice.toFixed(2),
    });
    evidence.push({
      skuCode: line.skuCode,
      field: "description",
      sheet: "Quotation",
      row: rowNumber,
      column: "C",
      sourceText: line.vendorDescription,
    });
  });

  // --- Notes block ---
  const notesStart = HEADER_ROW + lines.length + 3;
  ws.getCell(`A${notesStart}`).value = "Terms & Conditions";
  ws.getCell(`A${notesStart}`).font = { bold: true, size: 11 };

  const notes = [
    profile.freightStatement,
    `Payment: ${profile.paymentTerms}.`,
    `Lead time: ${profile.leadTimeDays} days from receipt of firm purchase order.`,
    "GST at 18% applicable extra on all rates above.",
    "Rates are firm for the contract year subject to the validity stated above.",
    "Bursting strength test certificate per IS 7028 supplied with every despatch.",
  ];
  notes.forEach((note, i) => {
    const r = notesStart + 1 + i;
    ws.mergeCells(`A${r}:G${r}`);
    ws.getCell(`A${r}`).value = `${i + 1}. ${note}`;
    ws.getCell(`A${r}`).font = { size: 9 };
    ws.getCell(`A${r}`).alignment = { wrapText: true };
  });

  evidence.push({
    field: "freight",
    sheet: "Quotation",
    row: notesStart + 1,
    column: "A",
    sourceText: `1. ${profile.freightStatement}`,
  });
  evidence.push({
    field: "payment_terms",
    sheet: "Quotation",
    row: notesStart + 2,
    column: "A",
    sourceText: `2. Payment: ${profile.paymentTerms}.`,
  });

  const relativePath = "vendors/vendor-a/quotation.xlsx";
  const buffer = await wb.xlsx.writeBuffer();
  await writeFile(path.join(root, relativePath), await stabilizeOoxml(Buffer.from(buffer)));

  return {
    relativePath,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "XLSX",
    evidence,
  };
}

/**
 * Vendor C's quotation: a plain export from an older system. No letterhead
 * styling to speak of, a separate UOM column that quietly switches to
 * "per 100 pcs" on the high-volume lines, and — importantly — not one word
 * about freight anywhere in the file.
 */
export async function generateVendorCQuotation(root: string): Promise<GeneratedDocument> {
  const profile = VENDOR_PROFILES["vendor-c"];
  const lines = buildVendorLines("vendor-c");
  const evidence: EvidenceRecord[] = [];

  const wb = new ExcelJS.Workbook();
  wb.creator = "CorrugateCo ERP Export";
  wb.created = FIXTURE_EPOCH;
  wb.modified = FIXTURE_EPOCH;
  const ws = wb.addWorksheet("Sheet1");

  ws.columns = [
    { key: "sl", width: 5 },
    { key: "code", width: 12 },
    { key: "desc", width: 44 },
    { key: "qty", width: 12 },
    { key: "uom", width: 14 },
    { key: "rate", width: 12 },
  ];

  ws.getCell("A1").value = `${profile.name} ${profile.legalSuffix}`;
  ws.getCell("A1").font = { bold: true, size: 12 };
  ws.getCell("A2").value = profile.addressLine;
  ws.getCell("A2").font = { size: 9 };
  ws.getCell("A3").value = `GSTIN ${profile.gstin}`;
  ws.getCell("A3").font = { size: 9 };
  ws.getCell("A5").value = `RATE QUOTATION - REF ${profile.quotationRef} DT ${profile.quotationDate}`;
  ws.getCell("A5").font = { bold: true, size: 10 };
  ws.getCell("A6").value = "SUB: ANNUAL RATE CONTRACT FY 2026-27 - CORRUGATED PACKAGING";
  ws.getCell("A6").font = { size: 10 };

  const HEADER_ROW = 8;
  const headers = ["SL", "CODE", "ITEM DESCRIPTION", "QTY", "UOM / BASIS", "RATE"];
  const headerRow = ws.getRow(HEADER_ROW);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9 };
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" } };
  });

  lines.forEach((line, i) => {
    const rfxLine = LINE_ITEMS.find((l) => l.skuCode === line.skuCode)!;
    const rowNumber = HEADER_ROW + 1 + i;
    const row = ws.getRow(rowNumber);

    // The UOM column is where the per-100 basis hides. Nothing else flags it.
    const uom =
      line.unitLabel === "per 100 pcs"
        ? "PER 100 PCS"
        : rfxLine.unit === "set"
          ? "SET"
          : rfxLine.unit === "roll"
            ? "ROLL"
            : "NOS";

    row.getCell(1).value = i + 1;
    row.getCell(2).value = line.vendorCode;
    row.getCell(3).value = line.vendorDescription;
    row.getCell(4).value = rfxLine.quantity;
    row.getCell(5).value = uom;
    row.getCell(6).value = line.printedPrice;
    row.getCell(4).numFmt = "#,##0";
    row.getCell(6).numFmt = "0.00";
    row.font = { size: 9, name: "Courier New" };

    evidence.push({
      skuCode: line.skuCode,
      field: "quoted_price",
      sheet: "Sheet1",
      row: rowNumber,
      column: "F",
      sourceText: line.printedPrice.toFixed(2),
    });
    evidence.push({
      skuCode: line.skuCode,
      field: "quoted_unit",
      sheet: "Sheet1",
      row: rowNumber,
      column: "E",
      sourceText: uom,
    });
  });

  const footer = HEADER_ROW + lines.length + 2;
  ws.getCell(`A${footer}`).value = `PAYMENT: ${profile.paymentTerms.toUpperCase()}`;
  ws.getCell(`A${footer + 1}`).value = `VALIDITY: ${profile.validityDays} DAYS`;
  ws.getCell(`A${footer + 2}`).value = `DELIVERY: ${profile.leadTimeDays} DAYS FROM PO`;
  ws.getCell(`A${footer + 3}`).value = "GST EXTRA AS APPLICABLE";
  for (let i = 0; i < 4; i++) ws.getCell(`A${footer + i}`).font = { size: 9 };

  const relativePath = "vendors/vendor-c/quotation.xlsx";
  const buffer = await wb.xlsx.writeBuffer();
  await writeFile(path.join(root, relativePath), await stabilizeOoxml(Buffer.from(buffer)));

  return {
    relativePath,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "XLSX",
    evidence,
  };
}
