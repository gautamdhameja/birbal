// Purpose: Defines llama.cpp model provider schemas.
// Scope: Validates local llama.cpp env values while reusing the OpenAI-compatible transport shape.

import { z } from "zod";

import { LLAMA } from "../constants/llama.js";
import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import { httpUrlErrorMessage, isHttpUrlWithoutCredentials } from "../http/url.js";
import {
  ChatMessageSchema,
  CompleteOptionsSchema,
  OpenAICompatibleChatCompletionRequestSchema,
  OpenAICompatibleChatCompletionResponseSchema,
  OpenAICompatibleConfigSchema,
} from "../model-providers/openai-compatible/schema.js";

export { ChatMessageSchema, CompleteOptionsSchema };

export const LlamaChatCompletionRequestSchema = OpenAICompatibleChatCompletionRequestSchema;
export const LlamaChatCompletionResponseSchema = OpenAICompatibleChatCompletionResponseSchema;

export const LlamaEnvSchema = z.strictObject({
  LLAMA_SERVER_URL: z.url().refine(isHttpUrlWithoutCredentials, httpUrlErrorMessage()),
  LLAMA_MODEL: z.string().min(1),
  LLAMA_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(LLAMA.DEFAULT_REQUEST_TIMEOUT_MS),
});

export const LlamaConfigSchema = OpenAICompatibleConfigSchema.extend({
  providerId: z.literal(MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type CompleteOptions = z.infer<typeof CompleteOptionsSchema>;
export type LlamaChatCompletionRequest = z.infer<typeof LlamaChatCompletionRequestSchema>;
export type LlamaChatCompletionResponse = z.infer<typeof LlamaChatCompletionResponseSchema>;
export type LlamaConfig = z.infer<typeof LlamaConfigSchema>;
