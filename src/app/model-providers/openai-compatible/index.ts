// Purpose: Exposes the OpenAI-compatible model provider building blocks.
// Scope: Keeps provider imports stable for concrete adapters.

export { createOpenAICompatibleModelClient } from "./client.js";
export {
  ChatMessageSchema,
  CompleteOptionsSchema,
  OpenAICompatibleChatCompletionRequestSchema,
  OpenAICompatibleChatCompletionResponseSchema,
  OpenAICompatibleConfigSchema,
} from "./schema.js";
export type {
  ChatMessage,
  CompleteOptions,
  OpenAICompatibleChatCompletionRequest,
  OpenAICompatibleChatCompletionResponse,
  OpenAICompatibleConfig,
} from "./schema.js";
