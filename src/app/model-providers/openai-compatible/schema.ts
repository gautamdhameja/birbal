// Purpose: Defines schemas for OpenAI-compatible chat completion providers.
// Scope: Validates the shared request, response, options, and provider config contract.

import { z } from "zod";

import { AGENT } from "../../constants/agent.js";
import { MODEL_PROVIDERS } from "../../constants/model-providers.js";
import { httpUrlErrorMessage, isHttpUrlWithoutCredentials } from "../../http/url.js";

export const ChatMessageSchema = z.strictObject({
  role: z.enum([AGENT.ROLES.SYSTEM, AGENT.ROLES.USER, AGENT.ROLES.ASSISTANT]),
  content: z.string(),
});

export const CompleteOptionsSchema = z.strictObject({
  temperature: z
    .number()
    .min(MODEL_PROVIDERS.TEMPERATURE_MIN)
    .max(MODEL_PROVIDERS.TEMPERATURE_MAX)
    .optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  response_format: z
    .strictObject({
      type: z.literal(MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT),
    })
    .optional(),
  traceId: z.string().trim().min(1).optional(),
  traceLabel: z.string().trim().min(1).optional(),
});

export const OpenAICompatibleChatCompletionRequestSchema = z
  .strictObject({
    model: z.string().min(1),
    messages: ChatMessageSchema.array().min(1),
    temperature: CompleteOptionsSchema.shape.temperature,
    max_tokens: CompleteOptionsSchema.shape.maxOutputTokens,
    max_completion_tokens: CompleteOptionsSchema.shape.maxOutputTokens,
    response_format: CompleteOptionsSchema.shape.response_format,
  })
  .refine((request) => !(request.max_tokens && request.max_completion_tokens), {
    message: "Only one output token limit parameter can be set.",
  });

export const OpenAICompatibleChatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .passthrough()
    .optional(),
});

export const OpenAICompatibleConfigSchema = z.strictObject({
  providerId: z.string().min(1),
  baseUrl: z.url().refine(isHttpUrlWithoutCredentials, httpUrlErrorMessage()),
  chatCompletionsPath: z.string().trim().startsWith("/"),
  outputTokenParameter: z.enum([
    MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_TOKENS,
    MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_COMPLETION_TOKENS,
  ]),
  model: z.string().min(1, MODEL_PROVIDERS.ERRORS.MODEL_NAME_REQUIRED),
  requestTimeoutMs: z.number().int().positive(),
  apiKey: z.string().min(1).optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type CompleteOptions = z.infer<typeof CompleteOptionsSchema>;
export type OpenAICompatibleChatCompletionRequest = z.infer<
  typeof OpenAICompatibleChatCompletionRequestSchema
>;
export type OpenAICompatibleChatCompletionResponse = z.infer<
  typeof OpenAICompatibleChatCompletionResponseSchema
>;
export type OpenAICompatibleConfig = z.infer<typeof OpenAICompatibleConfigSchema>;
