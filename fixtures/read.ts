import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

/**
 * Readers used by the fixture tests.
 *
 * The tests assert that each intentional edge case is present in the document
 * a vendor actually sent, not merely in the metadata describing it. That means
 * opening the real file and reading it back the way the extraction pipeline
 * will have to.
 */

export interface XlsxContent {
  text: string;
  /**
   * Numeric cell values as numbers.
   *
   * A spreadsheet stores 213.4, not the string "213.40" — so a price has to be
   * compared numerically. Matching on formatted text would fail on every value
   * whose last decimal place is a zero.
   */
  numbers: number[];
}

export async function readXlsx(absolutePath: string): Promise<XlsxContent> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(absolutePath);
  const parts: string[] = [];
  const numbers: number[] = [];
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (typeof cell.value === "number") numbers.push(cell.value);
        parts.push(String(cell.value ?? ""));
      });
    });
  });
  return { text: parts.join("\n"), numbers };
}

export async function readXlsxText(absolutePath: string): Promise<string> {
  return (await readXlsx(absolutePath)).text;
}

export async function readDocxText(absolutePath: string): Promise<string> {
  // A .docx is a zip; word/document.xml holds the body. Reading it directly
  // avoids pulling in a converter for what is a structural assertion.
  const { unzipSync, strFromU8 } = await import("fflate");
  const buffer = await readFile(absolutePath);
  const files = unzipSync(new Uint8Array(buffer));
  const documentXml = files["word/document.xml"];
  if (!documentXml) throw new Error(`No word/document.xml in ${absolutePath}`);
  return strFromU8(documentXml)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

export interface PdfContent {
  text: string;
  pageCount: number;
  /** True when the PDF carries no extractable text — i.e. it is a scan. */
  imageOnly: boolean;
}

export async function readPdf(absolutePath: string): Promise<PdfContent> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(absolutePath));
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " "),
    );
  }
  const pageCount = doc.numPages;
  await loadingTask.destroy();

  const text = pages.join("\n");
  return { text, pageCount, imageOnly: text.replace(/\s/g, "").length === 0 };
}

export async function readTextFile(absolutePath: string): Promise<string> {
  return readFile(absolutePath, "utf8");
}

export function fixturePath(fixturesRoot: string, relativePath: string): string {
  return path.join(fixturesRoot, relativePath);
}
