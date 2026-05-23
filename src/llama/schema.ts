import { z } from "zod";

import { AGENT } from "../constants/agent.js";
import { LLAMA } from "../constants/llama.js";
import { httpUrlErrorMessage, isHttpUrlWithoutCredentials } from "../http/url.js";

export const ChatMessageSchema = z.strictObject({
  role: z.enum([AGENT.ROLES.SYSTEM, AGENT.ROLES.USER, AGENT.ROLES.ASSISTANT]),
  content: z.string(),
});

export const CompleteOptionsSchema = z.strictObject({
  temperature: z.number().min(LLAMA.TEMPERATURE_MIN).max(LLAMA.TEMPERATURE_MAX).optional(),
  max_tokens: z.number().int().positive().optional(),
  response_format: z
    .strictObject({
      type: z.literal(LLAMA.RESPONSE_FORMATS.JSON_OBJECT),
    })
    .optional(),
  traceId: z.string().trim().min(1).optional(),
  traceLabel: z.string().trim().min(1).optional(),
});

export const LlamaChatCompletionRequestSchema = z.strictObject({
  model: z.string().min(1),
  messages: ChatMessageSchema.array().min(1),
  temperature: CompleteOptionsSchema.shape.temperature,
  max_tokens: CompleteOptionsSchema.shape.max_tokens,
  response_format: CompleteOptionsSchema.shape.response_format,
});

export const LlamaChatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      }),
    )
    .min(1),
});

export const LlamaEnvSchema = z.strictObject({
  LLAMA_SERVER_URL: z.url().refine(isHttpUrlWithoutCredentials, httpUrlErrorMessage()),
  LLAMA_MODEL: z.string().min(1),
});

export const LlamaConfigSchema = z.strictObject({
  serverUrl: z.url().refine(isHttpUrlWithoutCredentials, httpUrlErrorMessage()),
  model: z.string().min(1),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type CompleteOptions = z.infer<typeof CompleteOptionsSchema>;
export type LlamaChatCompletionRequest = z.infer<typeof LlamaChatCompletionRequestSchema>;
export type LlamaChatCompletionResponse = z.infer<typeof LlamaChatCompletionResponseSchema>;
export type LlamaConfig = z.infer<typeof LlamaConfigSchema>;
