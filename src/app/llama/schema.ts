// Purpose: Defines llama.cpp model provider schemas.
// Scope: Validates local llama.cpp env values while reusing the OpenAI-compatible transport shape.

import { z } from "zod";

import { MODEL_PROVIDERS } from "../constants/model-providers.js";
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

export const LlamaConfigSchema = OpenAICompatibleConfigSchema.extend({
  providerId: z.literal(MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type CompleteOptions = z.infer<typeof CompleteOptionsSchema>;
export type LlamaChatCompletionRequest = z.infer<typeof LlamaChatCompletionRequestSchema>;
export type LlamaChatCompletionResponse = z.infer<typeof LlamaChatCompletionResponseSchema>;
export type LlamaConfig = z.infer<typeof LlamaConfigSchema>;
