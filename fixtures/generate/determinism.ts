/**
 * Fixture generation must be byte-reproducible.
 *
 * The content is already deterministic — prices come from a seeded hash and
 * image noise from a seeded PRNG. What is not deterministic is the metadata the
 * container formats write on their own: PDF, XLSX and DOCX all stamp the
 * current time, and PDFKit derives its file ID from the creation timestamp.
 *
 * Byte-stability matters because these files are committed. Without it every
 * regeneration shows twelve changed binaries in the diff and a reviewer cannot
 * tell a real change from a re-run.
 */

/** The nominal authoring date for the whole fixture set. */
export const FIXTURE_EPOCH = new Date("2026-03-22T00:00:00.000Z");

export const PDF_INFO = {
  CreationDate: FIXTURE_EPOCH,
  ModDate: FIXTURE_EPOCH,
} as const;

/**
 * Normalizes the timestamps inside an OOXML container (.docx, .xlsx).
 *
 * Two independent clocks leak in: the dates in docProps/core.xml, and the
 * modification time the zip records for every entry. Both are pinned here. The
 * `docx` package exposes no option for the former, and neither library controls
 * the latter, so the file is unpacked, adjusted and repacked. Every other entry
 * is passed through byte-for-byte.
 */
export async function stabilizeOoxml(buffer: Buffer): Promise<Buffer> {
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import("fflate");

  const entries = unzipSync(new Uint8Array(buffer));
  const core = entries["docProps/core.xml"];
  if (core) {
    const iso = FIXTURE_EPOCH.toISOString().replace(/\.\d+Z$/, "Z");
    const xml = strFromU8(core)
      .replace(
        /<dcterms:created[^>]*>[^<]*<\/dcterms:created>/,
        `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created>`,
      )
      .replace(
        /<dcterms:modified[^>]*>[^<]*<\/dcterms:modified>/,
        `<dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>`,
      );
    entries["docProps/core.xml"] = strToU8(xml);
  }

  // A fixed mtime on every entry: the zip's own directory records times too.
  const zipInput: Record<string, [Uint8Array, { mtime: number }]> = {};
  for (const [name, content] of Object.entries(entries)) {
    zipInput[name] = [content, { mtime: FIXTURE_EPOCH.getTime() }];
  }

  return Buffer.from(zipSync(zipInput as never, { level: 6 }));
}

/** @deprecated Use {@link stabilizeOoxml}. Retained for call-site clarity. */
export const stabilizeDocx = stabilizeOoxml;
