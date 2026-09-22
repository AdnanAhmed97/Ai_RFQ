import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  TOOL_DESCRIPTIONS,
  TOOL_INPUT_SCHEMAS,
  TOOL_ORDER,
  ToolNames,
} from "@/lib/tools/definitions";

describe("decision tool contracts", () => {
  const names = Object.values(ToolNames);

  it("declares all ten tools from the specification", () => {
    expect(names).toHaveLength(10);
    expect(TOOL_ORDER).toHaveLength(10);
  });

  it("gives every tool a description and an input schema", () => {
    for (const name of names) {
      expect(TOOL_DESCRIPTIONS[name], `${name} description`).toBeTruthy();
      expect(TOOL_INPUT_SCHEMAS[name], `${name} schema`).toBeDefined();
    }
  });

  it("keeps the tool order complete and duplicate-free, since it is part of the cached prompt prefix", () => {
    expect(new Set(TOOL_ORDER).size).toBe(TOOL_ORDER.length);
    expect([...TOOL_ORDER].sort()).toEqual([...names].sort());
  });

  it("converts every input schema to JSON Schema the API will accept", () => {
    for (const name of names) {
      const jsonSchema = z.toJSONSchema(TOOL_INPUT_SCHEMAS[name], {
        target: "draft-7",
        io: "input",
      }) as { type?: string; properties?: Record<string, unknown> };
      expect(jsonSchema.type, `${name} root type`).toBe("object");
      expect(Object.keys(jsonSchema.properties ?? {}).length).toBeGreaterThan(0);
    }
  });

  it("rejects a split-award call missing its required flags rather than defaulting them", () => {
    // A silently defaulted eligibleOnly would change which vendors are considered.
    const result = TOOL_INPUT_SCHEMAS[ToolNames.calculateSplitAward].safeParse({
      rfqId: "rfq-1",
    });
    expect(result.success).toBe(false);
  });
});
