import { z } from "zod";

export const FinalResponseSchema = z.strictObject({
  type: z.literal("final"),
  answer: z.string(),
});

export const ToolCallResponseSchema = z.strictObject({
  type: z.literal("tool_call"),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
});

export const ClarifyResponseSchema = z.strictObject({
  type: z.literal("clarify"),
  question: z.string(),
});

export const AgentResponseSchema = z.discriminatedUnion("type", [
  FinalResponseSchema,
  ToolCallResponseSchema,
  ClarifyResponseSchema,
]);

export type AgentResponse = z.infer<typeof AgentResponseSchema>;
