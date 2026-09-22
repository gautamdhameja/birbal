import { z } from "zod";

import type { ToolDefinition } from "../tools/types.js";
import type { AgentResponse } from "./types.js";

export const FrameworkAgentFinalResponseSchema = z.strictObject({
  type: z.literal("final"),
  answer: z.string(),
});

export const FrameworkAgentToolCallResponseSchema = z.strictObject({
  type: z.literal("tool_call"),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
});

export const FrameworkAgentResponseSchema = z.discriminatedUnion("type", [
  FrameworkAgentFinalResponseSchema,
  FrameworkAgentToolCallResponseSchema,
]);

export type FrameworkAgentResponse = z.infer<typeof FrameworkAgentResponseSchema>;

export function createJsonStringCodec<T>(schema: z.ZodType<T>): z.ZodType<string> {
  return z.codec(schema, z.string(), {
    decode: (value) => JSON.stringify(value),
    encode: (value) => schema.parse(JSON.parse(value)),
  });
}

export function createFrameworkAgentResponseSchema(
  tools: readonly ToolDefinition[],
  finalAnswerSchema: z.ZodType<string> = z.string(),
): z.ZodType<AgentResponse> {
  const finalResponseSchema = FrameworkAgentFinalResponseSchema.extend({
    answer: finalAnswerSchema,
  });
  const toolCallSchemas = tools.map((tool) =>
    FrameworkAgentToolCallResponseSchema.extend({
      tool: z.literal(tool.name),
      args: tool.argsSchema,
    }),
  );

  const [firstToolCallSchema, ...remainingToolCallSchemas] = toolCallSchemas;
  if (!firstToolCallSchema) {
    return finalResponseSchema;
  }

  return z.union([finalResponseSchema, firstToolCallSchema, ...remainingToolCallSchemas]);
}

type ParseJsonAgentResponseOptions = {
  maxResponseChars?: number;
};

export function parseJsonAgentResponseWithSchema<T extends AgentResponse>(
  raw: string,
  schema: z.ZodType<T>,
  options: ParseJsonAgentResponseOptions = {},
): T {
  if (options.maxResponseChars !== undefined && raw.length > options.maxResponseChars) {
    throw new Error(`Agent response exceeded ${options.maxResponseChars} characters.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new Error("Agent response must be valid JSON with no surrounding text.");
  }

  return schema.parse(parsed);
}

export function parseJsonAgentResponse(
  raw: string,
  options: ParseJsonAgentResponseOptions = {},
): FrameworkAgentResponse {
  return parseJsonAgentResponseWithSchema(raw, FrameworkAgentResponseSchema, options);
}
