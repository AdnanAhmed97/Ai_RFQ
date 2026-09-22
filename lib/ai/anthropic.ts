import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  AIAuthenticationError,
  AIError,
  AIRateLimitError,
  AIRefusalError,
  AISchemaValidationError,
  AITruncatedResponseError,
  type AgentParams,
  type AgentResult,
  type AIAttachment,
  type AIProvider,
  type AnyAITool,
  type AIUsage,
  type StructuredGenerationParams,
  type StructuredResult,
  type TextGenerationParams,
  type TextResult,
  type ToolInvocation,
} from "./provider";
import { logAIOperation } from "./observability";

/**
 * OAuth access tokens and API keys are different credentials on different
 * headers. A console key (`sk-ant-api...`) goes on `x-api-key`; a token issued
 * by an OAuth login (`sk-ant-oat...`) goes on `Authorization: Bearer` and needs
 * its own beta flag. Sending one as the other returns 401, which reads exactly
 * like a bad key — so the shape is detected rather than assumed.
 */
const OAUTH_TOKEN_PREFIX = "sk-ant-oat";
const OAUTH_BETA = "oauth-2025-04-20";

export function isOAuthToken(credential: string): boolean {
  return credential.trim().startsWith(OAUTH_TOKEN_PREFIX);
}

const DEFAULT_MAX_TOKENS = 16_000;
const DEFAULT_AGENT_MAX_TOKENS = 32_000;
const DEFAULT_MAX_ITERATIONS = 12;

/**
 * Above roughly 21k output tokens the SDK refuses a non-streaming request,
 * because such a call can outlive the 10-minute HTTP timeout. Extraction over a
 * 30-line quotation needs more room than that, so the long-output paths stream
 * and collect the result with finalMessage(), which also carries parsed_output
 * when structured outputs are in use.
 */

/**
 * Anthropic implementation of {@link AIProvider}.
 *
 * Constructed per request with the session's BYOK key — never a module-level
 * singleton, because the key belongs to a session rather than to the process.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    credential: string,
    readonly model: string,
  ) {
    const token = credential.trim();
    this.client = isOAuthToken(token)
      ? new Anthropic({
          authToken: token,
          apiKey: null,
          defaultHeaders: { "anthropic-beta": OAUTH_BETA },
        })
      : new Anthropic({ apiKey: token });
  }

  async listModels(): Promise<string[]> {
    const ids: string[] = [];
    for await (const model of this.client.models.list()) ids.push(model.id);
    return ids;
  }

  async verifyCredentials(): Promise<void> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply with OK." }],
      });
    } catch (error) {
      throw this.translateError(error, "verify_credentials");
    }
  }

  async generateText(params: TextGenerationParams): Promise<TextResult> {
    const startedAt = Date.now();
    try {
      const response = await this.client.messages
        .stream({
          model: this.model,
          max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(params.system ? { system: this.systemBlocks(params) } : {}),
          ...(params.effort ? { output_config: { effort: params.effort } } : {}),
          messages: this.buildMessages(params.messages, params.attachments),
        })
        .finalMessage();

      this.assertUsableResponse(response, params.operation);

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      const usage = this.readUsage(response.usage);
      logAIOperation({
        operation: params.operation,
        model: this.model,
        status: "COMPLETED",
        durationMs: Date.now() - startedAt,
        usage,
      });

      return { text, usage, model: this.model };
    } catch (error) {
      logAIOperation({
        operation: params.operation,
        model: this.model,
        status: "FAILED",
        durationMs: Date.now() - startedAt,
        error: errorLabel(error),
      });
      throw this.translateError(error, params.operation);
    }
  }

  /**
   * Schema-constrained generation with exactly one corrective retry.
   *
   * On a second failure the call throws rather than returning partial data:
   * downstream code treats the extraction as FAILED and surfaces it (spec §48).
   */
  async generateStructured<T>(
    params: StructuredGenerationParams<T>,
  ): Promise<StructuredResult<T>> {
    const startedAt = Date.now();
    const messages = this.buildMessages(params.messages, params.attachments);
    let lastIssues: string[] = [];

    // Constrained decoding is the preferred path, but the API refuses to compile
    // a grammar past a certain complexity. When that happens the schema is still
    // the contract — it is just enforced by validating the reply instead of by
    // constraining generation. Zod is the real gate either way.
    let useGrammar = true;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.client.messages
          .stream({
            model: this.model,
            max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
            system: this.systemBlocks(params, useGrammar ? undefined : params.schema),
            output_config: {
              ...(params.effort ? { effort: params.effort } : {}),
              ...(useGrammar ? { format: zodOutputFormat(params.schema) } : {}),
            },
            messages,
          })
          .finalMessage();

        this.assertUsableResponse(response, params.operation);

        const raw = useGrammar
          ? response.parsed_output
          : parseJsonFromText(
              response.content
                .filter((b): b is Anthropic.TextBlock => b.type === "text")
                .map((b) => b.text)
                .join(""),
            );

        const parsed = params.schema.safeParse(raw);
        if (!parsed.success) {
          lastIssues = parsed.error.issues.map(
            (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
          );
          // Hand the model its own mistakes; do not re-send the documents.
          messages.push(
            { role: "assistant", content: JSON.stringify(response.parsed_output) },
            {
              role: "user",
              content:
                `That response did not satisfy the ${params.schemaName} schema:\n` +
                lastIssues.map((i) => `- ${i}`).join("\n") +
                "\nReturn corrected output. Use null and the documented " +
                "NOT_FOUND status for values the source does not state. Do not " +
                "substitute zero or invent a value to satisfy the schema.",
            },
          );
          continue;
        }

        const usage = this.readUsage(response.usage);
        logAIOperation({
          operation: params.operation,
          model: this.model,
          status: attempt === 0 ? "COMPLETED" : "PARTIAL",
          durationMs: Date.now() - startedAt,
          usage,
        });

        return { data: parsed.data, usage, model: this.model };
      } catch (error) {
        const translated =
          error instanceof AIError ? error : this.translateError(error, params.operation);

        // "The compiled grammar is too large" — the schema is valid, the
        // constrained-decoding compiler just will not take it. Retry once with
        // the schema stated in the prompt instead of enforced by the decoder.
        if (useGrammar && isGrammarTooLarge(translated)) {
          useGrammar = false;
          logAIOperation({
            operation: params.operation,
            model: this.model,
            status: "PARTIAL",
            durationMs: Date.now() - startedAt,
            error: "grammar_too_large_falling_back_to_prompted_json",
          });
          continue;
        }

        logAIOperation({
          operation: params.operation,
          model: this.model,
          status: "FAILED",
          durationMs: Date.now() - startedAt,
          error: errorLabel(translated),
        });
        throw translated;
      }
    }

    logAIOperation({
      operation: params.operation,
      model: this.model,
      status: "FAILED",
      durationMs: Date.now() - startedAt,
      error: "schema_validation_failed",
    });
    throw new AISchemaValidationError(params.operation, lastIssues);
  }

  /**
   * Tool-calling loop backing the Decision Copilot.
   *
   * Tool inputs are validated against their Zod schema before execution — the
   * model's arguments are untrusted input, and a bad argument must surface as a
   * tool error rather than as a wrong number.
   */
  async runToolAgent(params: AgentParams): Promise<AgentResult> {
    const startedAt = Date.now();
    const maxIterations = params.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const toolsByName = new Map<string, AnyAITool>(
      params.tools.map((t) => [t.name, t]),
    );

    const toolDefs: Anthropic.Tool[] = params.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: toJsonSchema(tool.inputSchema),
    }));

    const messages: Anthropic.MessageParam[] = params.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const invocations: ToolInvocation[] = [];
    const usage: AIUsage = { inputTokens: 0, outputTokens: 0 };
    let text = "";
    let truncated = true;

    try {
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        const response = await this.client.messages
          .stream({
            model: this.model,
            max_tokens: params.maxTokens ?? DEFAULT_AGENT_MAX_TOKENS,
            ...(params.system ? { system: this.systemBlocks(params) } : {}),
            ...(params.effort ? { output_config: { effort: params.effort } } : {}),
            tools: toolDefs,
            messages,
          })
          .finalMessage();

        this.assertUsableResponse(response, params.operation);
        accumulateUsage(usage, this.readUsage(response.usage));

        if (response.stop_reason === "end_turn") {
          text = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("");
          truncated = false;
          break;
        }

        const toolUses = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );
        if (toolUses.length === 0) break;

        messages.push({ role: "assistant", content: response.content });

        // All results go back in one user message — splitting them teaches the
        // model to stop issuing parallel calls.
        const results = await Promise.all(
          toolUses.map((use) => this.runTool(toolsByName, use, invocations)),
        );
        messages.push({ role: "user", content: results });
      }

      logAIOperation({
        operation: params.operation,
        model: this.model,
        status: truncated ? "PARTIAL" : "COMPLETED",
        durationMs: Date.now() - startedAt,
        usage,
        toolNames: invocations.map((i) => i.name),
      });

      return { text, toolInvocations: invocations, usage, model: this.model, truncated };
    } catch (error) {
      logAIOperation({
        operation: params.operation,
        model: this.model,
        status: "FAILED",
        durationMs: Date.now() - startedAt,
        error: errorLabel(error),
      });
      throw this.translateError(error, params.operation);
    }
  }

  private async runTool(
    toolsByName: Map<string, AnyAITool>,
    use: Anthropic.ToolUseBlock,
    invocations: ToolInvocation[],
  ): Promise<Anthropic.ToolResultBlockParam> {
    const startedAt = Date.now();
    const tool = toolsByName.get(use.name);

    if (!tool) {
      invocations.push({
        name: use.name,
        input: use.input,
        status: "ERROR",
        error: "unknown_tool",
        durationMs: 0,
      });
      return {
        type: "tool_result",
        tool_use_id: use.id,
        is_error: true,
        content: `Unknown tool: ${use.name}`,
      };
    }

    const parsedInput = tool.inputSchema.safeParse(use.input);
    if (!parsedInput.success) {
      const detail = parsedInput.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      invocations.push({
        name: use.name,
        input: use.input,
        status: "ERROR",
        error: `invalid_input: ${detail}`,
        durationMs: Date.now() - startedAt,
      });
      return {
        type: "tool_result",
        tool_use_id: use.id,
        is_error: true,
        content: `Invalid arguments for ${use.name}: ${detail}`,
      };
    }

    try {
      const output = await tool.execute(parsedInput.data as never);
      invocations.push({
        name: use.name,
        input: parsedInput.data,
        output,
        status: "OK",
        durationMs: Date.now() - startedAt,
      });
      return {
        type: "tool_result",
        tool_use_id: use.id,
        content: JSON.stringify(output),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "tool execution failed";
      invocations.push({
        name: use.name,
        input: parsedInput.data,
        status: "ERROR",
        error: message,
        durationMs: Date.now() - startedAt,
      });
      return {
        type: "tool_result",
        tool_use_id: use.id,
        is_error: true,
        content: message,
      };
    }
  }

  private systemBlocks(
    params: { system?: string; cacheSystem?: boolean },
    promptedSchema?: z.ZodType<unknown>,
  ): Anthropic.TextBlockParam[] {
    const blocks: Anthropic.TextBlockParam[] = [];

    if (params.system) {
      blocks.push({
        type: "text",
        text: params.system,
        ...(params.cacheSystem ? { cache_control: { type: "ephemeral" as const } } : {}),
      });
    }

    // Only present on the fallback path. Kept in its own block, after the
    // cached one, so adding it does not invalidate the cached prefix.
    if (promptedSchema) {
      blocks.push({
        type: "text",
        text:
          "Reply with a single JSON object and nothing else — no prose, no code " +
          "fence, no explanation. It must satisfy this JSON Schema exactly:\n\n" +
          JSON.stringify(z.toJSONSchema(promptedSchema, { target: "draft-7", io: "output" })) +
          "\n\nUse null for anything the source does not state. Never substitute " +
          "zero and never invent a value to satisfy a required field.",
      });
    }

    return blocks;
  }

  private buildMessages(
    messages: readonly { role: "user" | "assistant"; content: string }[],
    attachments?: AIAttachment[],
  ): Anthropic.MessageParam[] {
    const built: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    if (!attachments?.length) return built;

    // Attachments ride on the first user turn, ahead of its text — documents
    // before the question is the documented ordering for best adherence.
    const firstUserIndex = built.findIndex((m) => m.role === "user");
    const target = firstUserIndex === -1 ? 0 : firstUserIndex;
    const existing = built[target];
    const existingText = typeof existing?.content === "string" ? existing.content : "";

    const blocks: Anthropic.ContentBlockParam[] = attachments.map((a) => {
      switch (a.kind) {
        case "pdf":
          return {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: a.base64 },
            title: a.filename,
          };
        case "image":
          return {
            type: "image",
            source: { type: "base64", media_type: a.mediaType, data: a.base64 },
          };
        case "text":
          return { type: "text", text: `<document name="${a.filename}">\n${a.text}\n</document>` };
      }
    });

    built[target] = {
      role: "user",
      content: [...blocks, { type: "text", text: existingText }],
    };
    return built;
  }

  /** Rejects responses that are refusals or truncated before any parsing. */
  private assertUsableResponse(response: Anthropic.Message, operation: string): void {
    if (response.stop_reason === "refusal") {
      const details = response.stop_details;
      throw new AIRefusalError(
        operation,
        details && "category" in details ? details.category : null,
        details && "explanation" in details ? details.explanation : null,
      );
    }
    if (response.stop_reason === "max_tokens") {
      throw new AITruncatedResponseError(operation);
    }
  }

  private readUsage(usage: Anthropic.Usage): AIUsage {
    return {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? undefined,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? undefined,
    };
  }

  private translateError(error: unknown, operation: string): AIError {
    if (error instanceof AIError) return error;

    if (error instanceof Anthropic.AuthenticationError) {
      return new AIAuthenticationError(operation, error);
    }
    if (error instanceof Anthropic.RateLimitError) {
      const header = error.headers?.get?.("retry-after");
      const retryAfter = header ? Number(header) : undefined;
      return new AIRateLimitError(
        operation,
        Number.isFinite(retryAfter) ? retryAfter : undefined,
        error,
      );
    }
    if (error instanceof Anthropic.APIError) {
      // Carry the status and the provider's error type through. Diagnosing a
      // failed connection is impossible without them, and neither reveals the
      // key or the request body.
      const apiType =
        typeof error.error === "object" && error.error !== null && "error" in error.error
          ? ((error.error as { error?: { type?: string } }).error?.type ?? undefined)
          : undefined;
      const translated = new AIError(
        `AI provider returned ${error.status ?? "an unknown error"}${apiType ? ` (${apiType})` : ""}: ${error.message}`,
        operation,
        error,
      );
      translated.status = error.status;
      translated.apiType = apiType;
      return translated;
    }
    return new AIError("Unexpected AI provider failure.", operation, error);
  }
}

/** True when the API rejected the request because the grammar would not compile. */
function isGrammarTooLarge(error: AIError): boolean {
  return error.status === 400 && /compiled grammar is too large/i.test(error.message);
}

/**
 * Pulls the JSON object out of a text reply.
 *
 * Models sometimes wrap JSON in a code fence despite instructions. Stripping it
 * is cheap; failing the whole extraction over a pair of backticks is not.
 */
function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const body = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(body);
  } catch {
    // Fall back to the outermost braces, for a reply with a stray preamble.
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start === -1 || end <= start) return undefined;
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

function accumulateUsage(target: AIUsage, next: AIUsage): void {
  target.inputTokens += next.inputTokens;
  target.outputTokens += next.outputTokens;
  if (next.cacheReadTokens) {
    target.cacheReadTokens = (target.cacheReadTokens ?? 0) + next.cacheReadTokens;
  }
  if (next.cacheCreationTokens) {
    target.cacheCreationTokens = (target.cacheCreationTokens ?? 0) + next.cacheCreationTokens;
  }
}

/** Error label for logs. Deliberately excludes message bodies and headers. */
function errorLabel(error: unknown): string {
  if (error instanceof AIError) {
    return error.status ? `${error.name}_${error.status}${error.apiType ? `_${error.apiType}` : ""}` : error.name;
  }
  if (error instanceof Anthropic.APIError) return `api_error_${error.status ?? "unknown"}`;
  return "unexpected_error";
}

function toJsonSchema(schema: z.ZodType<unknown>): Anthropic.Tool["input_schema"] {
  return z.toJSONSchema(schema, {
    target: "draft-7",
    io: "input",
  }) as Anthropic.Tool["input_schema"];
}
