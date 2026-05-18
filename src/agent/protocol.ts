import { z } from "zod";

import { AGENT } from "../constants.js";

export const FinalResponseSchema = z.strictObject({
  type: z.literal(AGENT.RESPONSE_TYPES.FINAL),
  answer: z.string(),
});

export const ToolCallResponseSchema = z.strictObject({
  type: z.literal(AGENT.RESPONSE_TYPES.TOOL_CALL),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
});

export const ClarifyResponseSchema = z.strictObject({
  type: z.literal(AGENT.RESPONSE_TYPES.CLARIFY),
  question: z.string(),
});

export const AgentResponseSchema = z.discriminatedUnion("type", [
  FinalResponseSchema,
  ToolCallResponseSchema,
  ClarifyResponseSchema,
]);

export type AgentResponse = z.infer<typeof AgentResponseSchema>;
