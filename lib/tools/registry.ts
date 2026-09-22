import "server-only";
import { defineTool, type AnyAITool } from "@/lib/ai/provider";
import { TOOL_DESCRIPTIONS, TOOL_ORDER, toolInputSchema, type ToolName } from "./definitions";

/**
 * Binds tool contracts to their deterministic implementations.
 *
 * Implementations arrive in Slice 6 (the pricing and award engine). Until then
 * `buildDecisionTools` throws for any unimplemented tool rather than returning a
 * plausible stand-in — a tool that quietly returns a fake number is exactly the
 * failure mode this product exists to prevent.
 */
export type ToolImplementation<TInput = unknown, TOutput = unknown> = (
  input: TInput,
) => Promise<TOutput>;

export type ToolImplementations = Partial<Record<ToolName, ToolImplementation>>;

export class ToolNotImplementedError extends Error {
  constructor(readonly toolName: ToolName) {
    super(`Tool "${toolName}" has no implementation bound yet.`);
    this.name = "ToolNotImplementedError";
  }
}

export function buildDecisionTools(implementations: ToolImplementations): AnyAITool[] {
  return TOOL_ORDER.map((name) => {
    const execute = implementations[name];
    return defineTool({
      name,
      description: TOOL_DESCRIPTIONS[name],
      inputSchema: toolInputSchema(name),
      execute: async (input) => {
        if (!execute) throw new ToolNotImplementedError(name);
        return execute(input);
      },
    });
  });
}
