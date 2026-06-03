// Purpose: Exposes the hosted OpenAI model provider adapter.
// Scope: Keeps public imports stable for provider selection.

export { openAIModelAdapter } from "./adapter.js";
export { getOpenAIConfig } from "./config.js";
export { OpenAIConfigSchema, OpenAIEnvSchema } from "./schema.js";
export type { OpenAIConfig } from "./schema.js";
