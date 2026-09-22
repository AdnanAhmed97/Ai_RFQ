import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parseDocx, parseText, parseXlsx } = await import("@/lib/documents/parse");
const { buildVendorLines } = await import("@/fixtures/vendors/quote-data");
const { classifyByFilename, STRATEGY_BY_KIND, UnsupportedDocumentError } = await import(
  "@/lib/documents/classify"
);

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");
const at = (relative: string) => path.join(FIXTURES, relative);

describe("document classification", () => {
  it("sends PDFs and images to the model natively, and parses the rest", () => {
    expect(STRATEGY_BY_KIND.PDF).toBe("NATIVE_DOCUMENT");
    expect(STRATEGY_BY_KIND.IMAGE).toBe("NATIVE_IMAGE");
    expect(STRATEGY_BY_KIND.XLSX).toBe("STRUCTURED_TEXT");
    expect(STRATEGY_BY_KIND.DOCX).toBe("STRUCTURED_TEXT");
    expect(STRATEGY_BY_KIND.TEXT).toBe("STRUCTURED_TEXT");
  });

  it("classifies every format in the fixture corpus", () => {
    expect(classifyByFilename("quotation.xlsx").kind).toBe("XLSX");
    expect(classifyByFilename("quotation.pdf").kind).toBe("PDF");
    expect(classifyByFilename("questionnaire.docx").kind).toBe("DOCX");
    expect(classifyByFilename("photographed-rate-card.jpg").kind).toBe("IMAGE");
    expect(classifyByFilename("commercial-email.txt").kind).toBe("TEXT");
  });

  it("refuses an unknown format rather than guessing at it", () => {
    expect(() => classifyByFilename("quote.rtf")).toThrow(UnsupportedDocumentError);
  });
});

describe("spreadsheet parsing", () => {
  it("preserves sheet, row and column so a value can be cited", async () => {
    const parsed = await parseXlsx(at("vendors/vendor-a/quotation.xlsx"));
    expect(parsed.text).toContain('<sheet name="Quotation">');
    expect(parsed.text).toMatch(/Row 11: .*\[B\] PRI-0101/);

    // The rate must be addressable by its own column letter. The expected value
    // is derived from the fixture data rather than written in, so the test
    // cannot drift away from the document.
    const firstLine = buildVendorLines("vendor-a")[0]!;
    expect(parsed.text).toContain(`[F] ${firstLine.printedPrice}`);
    expect(parsed.partCount).toBe(1);
  });

  it("carries through the UOM column that marks Vendor C's per-100 basis", async () => {
    const parsed = await parseXlsx(at("vendors/vendor-c/quotation.xlsx"));
    expect(parsed.text).toContain("PER 100 PCS");
    expect(parsed.text).toMatch(/Row \d+:.*\[E\] PER 100 PCS/);
  });

  it("does not invent content for empty cells", async () => {
    const parsed = await parseXlsx(at("vendors/vendor-a/quotation.xlsx"));
    expect(parsed.text).not.toMatch(/\[\w+\]\s{2,}\|/);
    expect(parsed.text).not.toContain("undefined");
    expect(parsed.text).not.toContain("null");
  });

  it("emits a merged cell once, not once per column it spans", async () => {
    const parsed = await parseXlsx(at("vendors/vendor-a/quotation.xlsx"));
    const freightLine = parsed.text
      .split("\n")
      .find((line) => line.includes("inclusive of freight"));
    expect(freightLine).toBeDefined();
    // The terms block is merged across A:G. One occurrence, not seven.
    const occurrences = freightLine!.split("inclusive of freight").length - 1;
    expect(occurrences).toBe(1);
  });
});

describe("Word parsing", () => {
  it("keeps questionnaire rows intact so answers stay with their questions", async () => {
    const parsed = await parseDocx(at("vendors/vendor-b/questionnaire.docx"));
    expect(parsed.text).toMatch(/Table row \d+: Q4/);
    // The question and its answer must appear in the same row.
    const q4Row = parsed.text.split("\n").find((line) => line.includes(": Q4"));
    expect(q4Row).toBeDefined();
    expect(q4Row).toContain("bursting");
    expect(q4Row).toContain("IS 7028");
  });

  it("carries the vendor's certification claims through", async () => {
    const parsed = await parseDocx(at("vendors/vendor-b/questionnaire.docx"));
    expect(parsed.text).toContain("FSC-C119887");
    expect(parsed.text).toContain("ISO 9001:2015");
  });
});

describe("plain text parsing", () => {
  it("numbers lines so an email can be cited precisely", async () => {
    const parsed = await parseText(at("vendors/vendor-c/commercial-email.txt"));
    expect(parsed.text).toMatch(/^Line 1: From: M\. Vigneshwaran/m);
    expect(parsed.text).toMatch(/Line \d+: .*revised to/);
    expect(parsed.text).toMatch(/Line \d+: .*Rs\. 0\.85 per piece/);
  });
});
