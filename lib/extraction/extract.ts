import "server-only";
import type { AIProvider } from "@/lib/ai/provider";
import { DocumentExtractionSchema, type DocumentExtraction } from "@/lib/ai/schemas";
import { EXTRACTION_PROMPT, EXTRACTION_PROMPT_VERSION } from "@/lib/ai/prompts";
import type { IngestedDocument } from "@/lib/documents/ingest";
import { renderQuestionnaire, renderRfxLines, type RfxContext } from "./context";

/**
 * Reads one document.
 *
 * The RFx context goes in the system block and is marked cacheable: it is
 * identical for all twelve documents, so caching it is the difference between
 * paying for the catalogue once and paying for it twelve times.
 *
 * The document itself rides on the user turn, which is the part that varies.
 */
export interface ExtractionOutcome {
  extraction: DocumentExtraction;
  promptVersion: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function extractDocument(params: {
  provider: AIProvider;
  context: RfxContext;
  document: IngestedDocument;
}): Promise<ExtractionOutcome> {
  const { provider, context, document } = params;

  const system = `${EXTRACTION_PROMPT}

The buyer's request, for reference. Do not copy values from it — it tells you
what was asked for, not what this supplier answered.

<rfx title="${context.title}" category="${context.category}">
  <pricing_basis>${context.pricingBasis}</pricing_basis>
  <currency>${context.currency}</currency>
  <line_items>
${renderRfxLines(context)}
  </line_items>
  <questionnaire>
${renderQuestionnaire(context)}
  </questionnaire>
</rfx>`;

  const instruction = `Read the attached document, "${document.filename}".

Record every priced line it contains, in the order they appear, and any
questionnaire answers it carries. Use the question reference printed in the
document (for example "Q4") when reporting an answer.

${
  document.parsed
    ? "The document has been transcribed with its coordinates preserved. Cite the sheet and the row and column, or the line number, exactly as they are labelled in the transcription."
    : "Cite the page number for every value you report, and quote the text you read it from."
}

A line the supplier did not quote is simply absent. Do not emit a row for it.`;

  const result = await provider.generateStructured({
    operation: "extract_document",
    system,
    cacheSystem: true,
    // A transcribed spreadsheet is a reading task; a skewed scan or a
    // photographed card is a genuinely hard one. Spending the same thinking
    // budget on both pays scan latency on every document.
    effort: document.parsed ? "low" : "high",
    maxTokens: 32_000,
    schema: DocumentExtractionSchema,
    schemaName: "document_extraction",
    attachments: [document.attachment],
    messages: [{ role: "user", content: instruction }],
  });

  return {
    extraction: result.data,
    promptVersion: EXTRACTION_PROMPT_VERSION,
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  };
}
