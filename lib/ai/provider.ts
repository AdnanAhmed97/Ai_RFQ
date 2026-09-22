import type { z } from "zod";

/**
 * Provider-neutral AI interface (spec §7).
 *
 * Nothing in the product imports the Anthropic SDK directly. Product code
 * depends on this interface only, so a second provider can be added without
 * touching extraction, matching, or the decision agent.
 */

/** How hard the model should work. Maps to the API's effort control. */
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AIRequestBase {
  /** Stable system instruction. Kept first so the prompt prefix stays cacheable. */
  system?: string;
  /** Marks the system block as cacheable — worth it for document-heavy passes. */
  cacheSystem?: boolean;
  maxTokens?: number;
  effort?: ReasoningEffort;
  /** Labels the call in the operation log. Never sent to the model. */
  operation: string;
}

/** A document or image supplied to the model as evidence. */
export type AIAttachment =
  | { kind: "pdf"; filename: string; base64: string }
  | {
      kind: "image";
      filename: string;
      mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      base64: string;
    }
  | { kind: "text"; filename: string; text: string };

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TextGenerationParams extends AIRequestBase {
  messages: AIMessage[];
  attachments?: AIAttachment[];
}

export interface StructuredGenerationParams<T> extends AIRequestBase {
  messages: AIMessage[];
  attachments?: AIAttachment[];
  schema: z.ZodType<T>;
  /** Names the schema for the model. Improves adherence on complex shapes. */
  schemaName: string;
}

/**
 * A tool the model may call. `execute` is deterministic application code — the
 * model chooses *which* tool runs and with what arguments; it never computes
 * the result itself (spec §2.3).
 */
export interface AITool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (input: TInput) => Promise<TOutput>;
}

/**
 * A tool with its input type erased, as the provider boundary sees it.
 *
 * The provider validates every input against `inputSchema` before calling
 * `execute`, so the erasure is safe: nothing reaches a tool body without having
 * passed that tool's own schema.
 */
export type AnyAITool = AITool<unknown, unknown>;

/** Erases a typed tool for the provider boundary, preserving its schema. */
export function defineTool<TInput, TOutput>(tool: AITool<TInput, TOutput>): AnyAITool {
  return tool as unknown as AnyAITool;
}

export interface AgentParams extends AIRequestBase {
  messages: AIMessage[];
  tools: AnyAITool[];
  /** Hard stop on tool-calling rounds, so a loop cannot run away. */
  maxIterations?: number;
}

export interface ToolInvocation {
  name: string;
  input: unknown;
  output?: unknown;
  status: "OK" | "ERROR";
  error?: string;
  durationMs: number;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface AgentResult {
  text: string;
  toolInvocations: ToolInvocation[];
  usage: AIUsage;
  model: string;
  /** True when the loop hit `maxIterations` before the model finished. */
  truncated: boolean;
}

export interface StructuredResult<T> {
  data: T;
  usage: AIUsage;
  model: string;
}

export interface TextResult {
  text: string;
  usage: AIUsage;
  model: string;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;

  /** Schema-constrained generation. Used for every extraction path. */
  generateStructured<T>(
    params: StructuredGenerationParams<T>,
  ): Promise<StructuredResult<T>>;

  generateText(params: TextGenerationParams): Promise<TextResult>;

  /** Tool-calling loop. Backs the Decision Copilot. */
  runToolAgent(params: AgentParams): Promise<AgentResult>;

  /** Cheap round-trip used by the BYOK "Test connection" button. */
  verifyCredentials(): Promise<void>;

  /**
   * Model ids this credential can actually use.
   *
   * Asked rather than assumed: model availability varies by account, and a
   * configured id that the account cannot reach fails in a way that looks
   * exactly like a bad key.
   */
  listModels(): Promise<string[]>;
}

// --- Error taxonomy --------------------------------------------------------
// Callers branch on these rather than string-matching provider messages.

export class AIError extends Error {
  /** HTTP status from the provider, when the failure came from an API call. */
  status?: number;
  /** The provider's own error type, e.g. "not_found_error". Never a key or body. */
  apiType?: string;

  constructor(
    message: string,
    readonly operation: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIError";
  }
}

/** No usable credential. Distinct from an invalid one. */
export class AICredentialsMissingError extends AIError {
  constructor(operation: string) {
    super("No AI provider credentials available for this session.", operation);
    this.name = "AICredentialsMissingError";
  }
}

export class AIAuthenticationError extends AIError {
  constructor(operation: string, cause?: unknown) {
    super("The AI provider rejected the supplied credentials.", operation, cause);
    this.name = "AIAuthenticationError";
  }
}

export class AIRateLimitError extends AIError {
  constructor(
    operation: string,
    readonly retryAfterSeconds?: number,
    cause?: unknown,
  ) {
    super("The AI provider rate-limited this request.", operation, cause);
    this.name = "AIRateLimitError";
  }
}

/**
 * The model declined the request. Surfaced rather than retried, so an
 * extraction is never silently reported as complete.
 */
export class AIRefusalError extends AIError {
  constructor(
    operation: string,
    readonly category?: string | null,
    readonly explanation?: string | null,
  ) {
    super("The model declined to answer this request.", operation);
    this.name = "AIRefusalError";
  }
}

/**
 * The model returned data that does not match the schema, after one corrective
 * retry. Extraction is marked FAILED; malformed data is never accepted (spec §48).
 */
export class AISchemaValidationError extends AIError {
  constructor(
    operation: string,
    readonly issues: string[],
    cause?: unknown,
  ) {
    super(
      `Model output did not match the ${operation} schema after one retry.`,
      operation,
      cause,
    );
    this.name = "AISchemaValidationError";
  }
}

/** Output hit `max_tokens`. Treated as failure — a truncated quote is not a quote. */
export class AITruncatedResponseError extends AIError {
  constructor(operation: string) {
    super("The model response was cut off before it finished.", operation);
    this.name = "AITruncatedResponseError";
  }
}
