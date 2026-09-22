import type { RfxContext } from "./context";

/**
 * Deterministic line matching, before the model is asked anything.
 *
 * Most supplier lines are not ambiguous at all. "Corrugated Box 5Ply -
 * 600x400x300" and "5-ply RSC shipper, 600 x 400 x 300 mm" agree on ply and on
 * three dimensions; deciding they are the same item needs arithmetic, not
 * judgement. Sending all thirty to a model wastes a slow call on a question
 * code can answer.
 *
 * The rule is strict on purpose: a match is accepted only when the dimensions
 * and ply identify exactly one RFx line. Everything else — a missing dimension,
 * two candidates, a printed-versus-plain distinction — goes to the model, which
 * is what it is good at.
 */
export interface PrematchResult {
  /** vendorLineIndex → rfqLineId, for lines resolved without the model. */
  resolved: Map<number, { rfqLineId: string; reasoning: string }>;
  /** Indexes that still need judgement. */
  ambiguous: number[];
}

/** "600x400x300", "600 x 400 x 300 mm", "600/400/300MM" → "600x400x300". */
function dimensionKey(text: string): string | null {
  const match = /(\d{2,4})\s*[x×\/]\s*(\d{2,4})(?:\s*[x×\/]\s*(\d{2,4}))?/i.exec(text);
  if (!match) return null;
  const parts = [match[1], match[2], match[3]].filter(Boolean) as string[];
  return parts.join("x");
}

function plyOf(text: string): string | null {
  // "5-ply", "5Ply", "5 PLY", "5-LAYER", "3 ply"
  const match = /\b(\d)\s*-?\s*(?:ply|layer)\b/i.exec(text);
  return match?.[1] ?? null;
}

/** Printed and plain variants of one size are different lines. */
function isPrinted(text: string): boolean {
  return /\b(print|printed|prtd|colour|color|flexo)\b/i.test(text);
}

export function prematchLines(params: {
  context: RfxContext;
  vendorDescriptions: (string | null)[];
}): PrematchResult {
  const { context, vendorDescriptions } = params;

  // Index the RFx by dimensions + ply.
  const index = new Map<string, { id: string; printed: boolean }[]>();
  for (const line of context.lines) {
    const specs = line.specifications;
    const dims = dimensionKey(
      specs["internalDimensionsMm"] ??
        specs["dimensionsMm"] ??
        specs["blankSizeMm"] ??
        line.description,
    );
    const ply = specs["ply"] ?? plyOf(line.description);
    if (!dims || !ply) continue;

    const key = `${ply}|${dims}`;
    const entry = index.get(key) ?? [];
    entry.push({ id: line.id, printed: isPrinted(line.description) });
    index.set(key, entry);
  }

  const resolved = new Map<number, { rfqLineId: string; reasoning: string }>();
  const ambiguous: number[] = [];

  vendorDescriptions.forEach((description, vendorIndex) => {
    if (!description) {
      ambiguous.push(vendorIndex);
      return;
    }

    const dims = dimensionKey(description);
    const ply = plyOf(description);
    if (!dims || !ply) {
      ambiguous.push(vendorIndex);
      return;
    }

    const candidates = index.get(`${ply}|${dims}`) ?? [];
    if (candidates.length === 0) {
      ambiguous.push(vendorIndex);
      return;
    }

    // One size may exist as both a plain and a printed line.
    const narrowed =
      candidates.length > 1
        ? candidates.filter((c) => c.printed === isPrinted(description))
        : candidates;

    if (narrowed.length !== 1) {
      ambiguous.push(vendorIndex);
      return;
    }

    resolved.set(vendorIndex, {
      rfqLineId: narrowed[0]!.id,
      reasoning: `${ply}-ply and ${dims} identify exactly one RFx line; matched on specification, not on wording.`,
    });
  });

  return { resolved, ambiguous };
}
