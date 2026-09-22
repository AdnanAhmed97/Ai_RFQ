import "server-only";
import type { AIProvider } from "@/lib/ai/provider";
import { LineMatchBatchSchema, type LineMatchBatch } from "@/lib/ai/schemas";
import { LINE_MATCHING_PROMPT, LINE_MATCHING_PROMPT_VERSION } from "@/lib/ai/prompts";
import type { DocumentExtraction } from "@/lib/ai/schemas";
import { renderRfxLines, type RfxContext } from "./context";

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
    };
  }

  const vendorLines = extraction.quotes
    .map(
      (quote, index) =>
        `<vendor_line index="${index}">
  description: ${quote.rawDescription ?? "(none given)"}
  quoted: ${quote.quotedPrice ?? "none"} ${quote.currency ?? ""} ${quote.quotedUnit ?? ""}
</vendor_line>`,
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
    effort: "high",
    maxTokens: 32_000,
    schema: LineMatchBatchSchema,
    schemaName: "line_matches",
    messages: [
      {
        role: "user",
        content: `Map every one of the ${extraction.quotes.length} lines ${vendorName} quoted onto the RFx. Return one entry per vendor line, using the vendorLineIndex given above. Use the RFx line's id attribute as rfqLineId.`,
      },
    ],
  });

  return {
    matches: result.data.matches,
    promptVersion: LINE_MATCHING_PROMPT_VERSION,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  };
}
