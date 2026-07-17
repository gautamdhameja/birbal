import { z } from "zod";

export const FrameworkAgentFinalResponseSchema = z.strictObject({
  type: z.literal("final"),
  answer: z.string(),
});

export const FrameworkAgentToolCallResponseSchema = z.strictObject({
  type: z.literal("tool_call"),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
});

export const FrameworkAgentClarifyResponseSchema = z.strictObject({
  type: z.literal("clarify"),
  question: z.string(),
});

export const FrameworkAgentResponseSchema = z.discriminatedUnion("type", [
  FrameworkAgentFinalResponseSchema,
  FrameworkAgentToolCallResponseSchema,
  FrameworkAgentClarifyResponseSchema,
]);

export type FrameworkAgentResponse = z.infer<typeof FrameworkAgentResponseSchema>;

export function parseJsonAgentResponse(
  raw: string,
  options: {
    maxResponseChars?: number;
  } = {},
): FrameworkAgentResponse {
  if (options.maxResponseChars !== undefined && raw.length > options.maxResponseChars) {
    throw new Error(`Agent response exceeded ${options.maxResponseChars} characters.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new Error("Agent response must be valid JSON with no surrounding text.");
  }

  return FrameworkAgentResponseSchema.parse(parsed);
}
