import path from "node:path";
import { fileURLToPath } from "node:url";
import { stat } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";

import { readDocxText, readPdf, readTextFile, readXlsx } from "@/fixtures/read";
import { buildVendorLines, VENDOR_C_FREIGHT_PER_PIECE, vendorCRevisedPrice, VENDOR_C_REVISED_SKUS } from "@/fixtures/vendors/quote-data";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");
const at = (relative: string) => path.join(FIXTURES, relative);

/**
 * Every intentional edge case from spec §59 must be present in the source
 * material itself. A test that only checked our own metadata would pass on a
 * corpus that is secretly easy — which would make every later extraction
 * benchmark meaningless.
 */
describe("edge cases exist in the actual documents", () => {
  describe("Vendor A — the clean baseline", () => {
    let text: string;
    let numbers: Set<number>;
    beforeAll(async () => {
      const content = await readXlsx(at("vendors/vendor-a/quotation.xlsx"));
      text = content.text;
      numbers = new Set(content.numbers);
    });

    it("quotes all 30 lines", () => {
      const lines = buildVendorLines("vendor-a");
      expect(lines).toHaveLength(30);
      for (const line of lines) {
        expect(numbers.has(line.printedPrice), `${line.skuCode} rate ${line.printedPrice}`).toBe(
          true,
        );
      }
    });

    it("states freight as included (edge case 5)", () => {
      expect(text.toLowerCase()).toContain("inclusive of freight");
    });
  });

  describe("Vendor B — bundle pricing and missing lines", () => {
    let text: string;
    beforeAll(async () => {
      text = (await readPdf(at("vendors/vendor-b/quotation.pdf"))).text;
    });

    it("omits 3 of 30 lines entirely, with no zero left behind (edge cases 1, 13)", () => {
      expect(buildVendorLines("vendor-b")).toHaveLength(27);

      // Distinctive strings, not bare dimensions: "1200" also occurs inside
      // the angle-board size and would give a false positive.
      const absentMarkers = [
        "900x600x500", // CP-5R-013
        "1000x700x700", // CP-7R-019
        "Corrugated Roll", // CP-WRP-030
      ];
      for (const marker of absentMarkers) {
        expect(text, `${marker} should not appear`).not.toContain(marker);
      }

      // 27 item codes, contiguous. A skipped line leaves no placeholder row.
      const codes = text.match(/BW-\d{4}/g) ?? [];
      expect(new Set(codes).size).toBe(27);
      expect(text).not.toMatch(/\b0\.00\b/);
    });

    it("prices some lines per bundle WITH the quantity stated (edge case 2)", () => {
      expect(text).toContain("Bundle of 100");
      expect(text).toContain("Bundle of 50");
      expect(text).toContain("Bundle of 25");
      expect(text).toContain("Bundle of 200");
    });

    it("prices other lines per bundle with NO quantity anywhere (edge case 3)", () => {
      const unstated = buildVendorLines("vendor-b").filter(
        (l) => l.unitLabel === "per bundle" && l.packQty === undefined,
      );
      expect(unstated).toHaveLength(3);

      // Each is visibly priced per bundle, and the document nowhere says how many.
      for (const line of unstated) {
        expect(text, line.skuCode).toContain(line.printedPrice.toFixed(2));
        expect(text, `${line.skuCode} must not carry a bundle quantity`).not.toContain(
          `${line.vendorDescription}  [`,
        );
      }
      expect(text).toContain("Per bundle");
    });

    it("states freight as extra with no amount (edge case 6)", () => {
      expect(text).toMatch(/Ex-Works/i);
      expect(text).toMatch(/Freight extra, at actuals/i);
    });
  });

  describe("Vendor C — per-100 basis and a contradicting email", () => {
    let sheet: string;
    let sheetNumbers: Set<number>;
    let email: string;
    beforeAll(async () => {
      const content = await readXlsx(at("vendors/vendor-c/quotation.xlsx"));
      sheet = content.text;
      sheetNumbers = new Set(content.numbers);
      email = await readTextFile(at("vendors/vendor-c/commercial-email.txt"));
    });

    it("quotes 8 lines per 100 pieces in the spreadsheet (edge case: unit mismatch)", () => {
      expect(sheet).toContain("PER 100 PCS");
      const perHundred = buildVendorLines("vendor-c").filter(
        (l) => l.unitLabel === "per 100 pcs",
      );
      expect(perHundred).toHaveLength(8);
      for (const line of perHundred) {
        expect(sheetNumbers.has(line.printedPrice), line.skuCode).toBe(true);
      }
    });

    it("says nothing at all about freight in the spreadsheet", () => {
      expect(sheet.toLowerCase()).not.toContain("freight");
    });

    it("contradicts its own spreadsheet in a later email (edge case 8)", () => {
      for (const sku of VENDOR_C_REVISED_SKUS) {
        const original = buildVendorLines("vendor-c").find((l) => l.skuCode === sku)!;
        const revised = vendorCRevisedPrice(sku)!;

        // Both numbers are real and on file, in two documents that disagree.
        expect(sheetNumbers.has(original.printedPrice), `${sku} original in sheet`).toBe(true);
        expect(email, `${sku} original in email`).toContain(original.printedPrice.toFixed(2));
        expect(email, `${sku} revision in email`).toContain(revised.toFixed(2));
        expect(sheetNumbers.has(revised), `${sku} revision must NOT be in the sheet`).toBe(false);
      }
    });

    it("introduces a freight charge only in the email (edge case 6)", () => {
      expect(email).toContain(`Rs. ${VENDOR_C_FREIGHT_PER_PIECE.toFixed(2)} per piece`);
      expect(email.toLowerCase()).toContain("ex-works");
    });

    it("carries the questionnaire caveat through into the email (edge case 9)", () => {
      expect(email.toLowerCase()).toContain("bursting strength certificate");
      expect(email.toLowerCase()).toContain("monthly consolidated test report");
    });

    it("records the mandatory questionnaire exception in the questionnaire itself", async () => {
      const { text } = await readPdf(at("vendors/vendor-c/questionnaire.pdf"));
      expect(text).toMatch(/on request for orders above 50,?000 pieces/i);
      expect(text).toMatch(/consolidated monthly test report/i);
    });
  });

  describe("Vendor D — a genuine scan", () => {
    it("is image-only, with no text layer to shortcut OCR (edge case 10)", async () => {
      const pdf = await readPdf(at("vendors/vendor-d/scanned-quotation.pdf"));
      expect(pdf.pageCount).toBe(2);
      expect(
        pdf.imageOnly,
        "the scanned quotation must carry no extractable text — otherwise it is not a scan",
      ).toBe(true);
    });

    it("is large enough to be a real scan rather than a placeholder", async () => {
      const info = await stat(at("vendors/vendor-d/scanned-quotation.pdf"));
      expect(info.size).toBeGreaterThan(100_000);
    });

    it("omits exactly one line (edge case 15)", () => {
      expect(buildVendorLines("vendor-d")).toHaveLength(29);
    });
  });

  describe("Vendor E — a photograph, dollars, and pen", () => {
    it("is a JPEG photograph at plausible dimensions (edge case 10, 12)", async () => {
      const meta = await sharp(at("vendors/vendor-e/photographed-rate-card.jpg")).metadata();
      expect(meta.format).toBe("jpeg");
      expect(meta.width).toBeGreaterThan(1400);
      expect(meta.height).toBeGreaterThan(2000);
      // Colour, not greyscale — a photo, not a scan.
      expect(meta.channels).toBe(3);
    });

    it("is not a flat render: the page has a lighting gradient across it", async () => {
      // A generated page with no photographic treatment has a uniform
      // background. Comparing corner luminance proves the degradation is real.
      const image = sharp(at("vendors/vendor-e/photographed-rate-card.jpg"));
      const { width, height } = await image.metadata();
      const corner = async (left: number, top: number) => {
        const { data } = await sharp(at("vendors/vendor-e/photographed-rate-card.jpg"))
          .extract({ left, top, width: 200, height: 200 })
          .greyscale()
          .raw()
          .toBuffer({ resolveWithObject: true });
        return data.reduce((s, v) => s + v, 0) / data.length;
      };
      const topLeft = await corner(Math.round(width! * 0.2), Math.round(height! * 0.12));
      const bottomRight = await corner(Math.round(width! * 0.7), Math.round(height! * 0.85));
      expect(Math.abs(topLeft - bottomRight)).toBeGreaterThan(4);
    });

    it("quotes 4 lines in USD (edge case 4)", () => {
      const usd = buildVendorLines("vendor-e").filter((l) => l.currency === "USD");
      expect(usd).toHaveLength(4);
      expect(usd.map((l) => l.skuCode).sort()).toEqual([
        "CP-5H-016",
        "CP-5R-012",
        "CP-5R-013",
        "CP-7R-018",
      ]);
    });

    it("omits exactly two lines (edge case 14)", () => {
      expect(buildVendorLines("vendor-e")).toHaveLength(28);
    });

    it("leaves freight unstated (edge case 7)", async () => {
      const { text } = await readPdf(at("vendors/vendor-e/questionnaire.pdf"));
      // The card itself carries "Freight: As applicable" — unreadable without
      // vision, which is the point. The questionnaire confirms the vendor
      // never resolved it elsewhere.
      expect(text.toLowerCase()).not.toContain("freight included");
    });
  });

  describe("Vendor B questionnaire arrives as a Word document", () => {
    it("is a real docx with the answers in it", async () => {
      const text = await readDocxText(at("vendors/vendor-b/questionnaire.docx"));
      expect(text).toContain("ISO 9001:2015");
      expect(text).toContain("FSC-C119887");
      expect(text).toContain("Q4");
    });
  });

  describe("Vendor E questionnaire carries an undeterminable answer", () => {
    it("neither confirms nor denies a mandatory certification (edge case 11)", async () => {
      const { text } = await readPdf(at("vendors/vendor-e/questionnaire.pdf"));
      expect(text).toMatch(/renewal is currently in process/i);
      expect(text).toMatch(/lapsed in January 2026/i);
    });
  });
});
