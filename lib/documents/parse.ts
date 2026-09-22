import "server-only";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";

/**
 * Parses spreadsheets and Word documents into a text form that preserves the
 * coordinates a citation needs.
 *
 * The model is going to be asked where each number came from. If it is handed
 * a bare table it can only answer "the spreadsheet"; handed rows and columns
 * labelled the way the file labels them, it can answer "Pricing, row 12,
 * column F" — which is the difference between an assertion and evidence.
 */

export interface ParsedDocument {
  /** Structured text handed to the model. */
  text: string;
  /** Sheets, pages or sections, for the documents record. */
  partCount: number;
  /** Cached alongside the document so a file is read from disk once. */
  structure: unknown;
}

function columnLetter(index: number): string {
  let n = index;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return String(value.result ?? "");
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if (value instanceof Date) return value.toISOString().slice(0, 10);
  }
  return String(value);
}

/**
 * Renders a workbook as one block per sheet, every populated cell tagged with
 * its own column letter and row number.
 */
export async function parseXlsx(absolutePath: string): Promise<ParsedDocument> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(absolutePath);

  const sheets: { name: string; rows: { row: number; cells: { column: string; value: string }[] }[] }[] =
    [];

  workbook.eachSheet((sheet) => {
    const rows: { row: number; cells: { column: string; value: string }[] }[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: { column: string; value: string }[] = [];
      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        // A merged range reports its value in every cell it spans. Keeping only
        // the anchor stops a one-line footnote arriving as seven identical
        // copies, which wastes context and makes the citation ambiguous.
        if (cell.isMerged && cell.master !== cell) return;
        const text = cellText(cell.value).trim();
        if (text) cells.push({ column: columnLetter(columnNumber), value: text });
      });
      if (cells.length > 0) rows.push({ row: rowNumber, cells });
    });
    sheets.push({ name: sheet.name, rows });
  });

  const text = sheets
    .map((sheet) => {
      const body = sheet.rows
        .map(
          (row) =>
            `Row ${row.row}: ` +
            row.cells.map((cell) => `[${cell.column}] ${cell.value}`).join("  |  "),
        )
        .join("\n");
      return `<sheet name="${sheet.name}">\n${body}\n</sheet>`;
    })
    .join("\n\n");

  return { text, partCount: sheets.length, structure: sheets };
}

interface DocxBlock {
  index: number;
  type: "paragraph" | "table_row";
  text: string;
}

/**
 * Reads a .docx by unpacking word/document.xml.
 *
 * Paragraph and table-row boundaries are kept because a questionnaire answer in
 * a Word table needs to stay attached to the question in the adjacent cell.
 */
export async function parseDocx(absolutePath: string): Promise<ParsedDocument> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const buffer = await readFile(absolutePath);
  const entries = unzipSync(new Uint8Array(buffer));
  const documentXml = entries["word/document.xml"];
  if (!documentXml) throw new Error(`No word/document.xml in ${absolutePath}`);

  const xml = strFromU8(documentXml);
  const blocks: DocxBlock[] = [];

  // Table rows first, so their cells stay grouped; then loose paragraphs.
  const rowPattern = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;
  const tableRows = xml.match(rowPattern) ?? [];
  const withoutTables = xml.replace(rowPattern, "\u0000ROW\u0000");

  let rowCursor = 0;
  let index = 0;
  for (const segment of withoutTables.split("\u0000")) {
    if (segment === "ROW") {
      const row = tableRows[rowCursor++]!;
      const cells = [...row.matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)].map((match) =>
        stripXml(match[0]),
      );
      const text = cells.filter(Boolean).join("  |  ");
      if (text) blocks.push({ index: index++, type: "table_row", text });
      continue;
    }
    for (const paragraph of segment.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? []) {
      const text = stripXml(paragraph);
      if (text) blocks.push({ index: index++, type: "paragraph", text });
    }
  }

  const text = blocks
    .map((block) =>
      block.type === "table_row"
        ? `Table row ${block.index}: ${block.text}`
        : `Paragraph ${block.index}: ${block.text}`,
    )
    .join("\n");

  return { text, partCount: 1, structure: blocks };
}

function stripXml(fragment: string): string {
  return fragment
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Plain text, with line numbers so a quotation can cite one. */
export async function parseText(absolutePath: string): Promise<ParsedDocument> {
  const raw = await readFile(absolutePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const text = lines.map((line, i) => `Line ${i + 1}: ${line}`).join("\n");
  return { text, partCount: 1, structure: { lineCount: lines.length } };
}

export async function readBase64(absolutePath: string): Promise<string> {
  return (await readFile(absolutePath)).toString("base64");
}
