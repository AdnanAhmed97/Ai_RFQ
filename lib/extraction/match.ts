import "server-only";
import type { AIProvider } from "@/lib/ai/provider";
import { LineMatchBatchSchema, type LineMatchBatch } from "@/lib/ai/schemas";
import { LINE_MATCHING_PROMPT, LINE_MATCHING_PROMPT_VERSION } from "@/lib/ai/prompts";
import type { DocumentExtraction } from "@/lib/ai/schemas";
import { renderRfxLines, type RfxContext } from "./context";
import { prematchLines } from "./prematch";

/**
 * Maps a supplier's own line descriptions onto RFx lines.
 *
 * A separate call from extraction, deliberately. Reading a document and
 * deciding what an item is are different judgements, and folding them together
 * lets a shaky match ride on the back of a confident read.
 */
export interface MatchOutcome {
  matches: LineMatchBatch["matches"];
  promptVersion: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** How many lines code resolved without asking the model. */
  prematchedCount: number;
}

export async function matchLines(params: {
  provider: AIProvider;
  context: RfxContext;
  extraction: DocumentExtraction;
  vendorName: string;
}): Promise<MatchOutcome> {
  const { provider, context, extraction, vendorName } = params;

  if (extraction.quotes.length === 0) {
    return {
      matches: [],
      promptVersion: LINE_MATCHING_PROMPT_VERSION,
      model: provider.model,
      inputTokens: 0,
      outputTokens: 0,
      prematchedCount: 0,
    };
  }

  // Resolve what specification alone can settle. Ply plus three dimensions
  // identifying exactly one RFx line is arithmetic, not judgement, and on a
  // clean quotation that accounts for nearly every line.
  const prematch = prematchLines({
    context,
    vendorDescriptions: extraction.quotes.map((q) => q.rawDescription),
  });

  const prematched: LineMatchBatch["matches"] = [...prematch.resolved.entries()].map(
    ([vendorLineIndex, resolution]) => ({
      vendorLineIndex,
      status: "MATCHED" as const,
      rfqLineId: resolution.rfqLineId,
      score: 1,
      reasoning: resolution.reasoning,
      candidates: [],
    }),
  );

  // Nothing left for the model: skip the call entirely.
  if (prematch.ambiguous.length === 0) {
    return {
      matches: prematched,
      promptVersion: LINE_MATCHING_PROMPT_VERSION,
      model: provider.model,
      inputTokens: 0,
      outputTokens: 0,
      prematchedCount: prematched.length,
    };
  }

  const vendorLines = prematch.ambiguous
    .map(
      (index) => {
        const quote = extraction.quotes[index]!;
        return `<vendor_line index="${index}">
  description: ${quote.rawDescription ?? "(none given)"}
  quoted: ${quote.quotedPrice ?? "none"} ${quote.currency ?? ""} ${quote.quotedUnit ?? ""}
</vendor_line>`;
      },
    )
    .join("\n");

  const prompt = LINE_MATCHING_PROMPT.replace("{{RFX_LINES}}", renderRfxLines(context)).replace(
    "{{VENDOR_LINES}}",
    vendorLines,
  );

  const result = await provider.generateStructured({
    operation: "match_lines",
    system: prompt,
    cacheSystem: false,
    // Only the genuinely ambiguous lines reach here, and each is a small
    // judgement. High effort on a short list buys nothing but latency.
    effort: "medium",
    maxTokens: 16_000,
    schema: LineMatchBatchSchema,
    schemaName: "line_matches",
    messages: [
      {
        role: "user",
        content: `${prematched.length} of ${extraction.quotes.length} lines ${vendorName} quoted were matched on specification already. Map the ${prematch.ambiguous.length} below that specification could not settle. Return one entry per vendor line listed, using the vendorLineIndex given. Use the RFx line's id attribute as rfqLineId.`,
      },
    ],
  });

  return {
    matches: [...prematched, ...result.data.matches],
    promptVersion: LINE_MATCHING_PROMPT_VERSION,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    prematchedCount: prematched.length,
  };
}
