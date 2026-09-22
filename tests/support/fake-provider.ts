import type {
  AgentParams,
  AgentResult,
  AIProvider,
  StructuredGenerationParams,
  StructuredResult,
  TextGenerationParams,
  TextResult,
} from "@/lib/ai/provider";

/**
 * A stand-in for the model, used to exercise everything around it.
 *
 * It is NOT a stand-in for extraction. It returns whatever the test hands it,
 * so what is under test is the pipeline: ingestion, the job state machine,
 * validation, persistence and evidence — the parts that must be correct
 * regardless of what the model says.
 *
 * Whether the model reads a scanned rate card correctly is a separate question,
 * answerable only against the live API.
 */
export class FakeProvider implements AIProvider {
  readonly name = "fake";
  readonly model = "fake-model";

  readonly calls: { operation: string; schemaName?: string }[] = [];

  constructor(
    private readonly responses: {
      byOperation: Record<string, unknown>;
      failOn?: string;
    },
  ) {}

  async generateStructured<T>(
    params: StructuredGenerationParams<T>,
  ): Promise<StructuredResult<T>> {
    this.calls.push({ operation: params.operation, schemaName: params.schemaName });

    if (this.responses.failOn === params.operation) {
      throw new Error(`fake failure for ${params.operation}`);
    }

    const payload = this.responses.byOperation[params.operation];
    if (payload === undefined) {
      throw new Error(`FakeProvider has no response for "${params.operation}"`);
    }

    // Validated against the real schema, so a malformed fixture fails the test
    // rather than flowing into the database.
    const parsed = params.schema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(
        `FakeProvider payload for ${params.operation} does not satisfy ${params.schemaName}: ` +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }

    return {
      data: parsed.data,
      usage: { inputTokens: 100, outputTokens: 50 },
      model: this.model,
    };
  }

  async generateText(params: TextGenerationParams): Promise<TextResult> {
    this.calls.push({ operation: params.operation });
    return { text: "", usage: { inputTokens: 0, outputTokens: 0 }, model: this.model };
  }

  async runToolAgent(params: AgentParams): Promise<AgentResult> {
    this.calls.push({ operation: params.operation });
    return {
      text: "",
      toolInvocations: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      model: this.model,
      truncated: false,
    };
  }

  async verifyCredentials(): Promise<void> {}

  async listModels(): Promise<string[]> {
    return [this.model];
  }
}
