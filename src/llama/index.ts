// Purpose: Exposes the public llama.cpp integration API.
// Scope: Adapts the local OpenAI-compatible server to framework model contracts.

export { llamaCppModelAdapter } from "./adapter.js";
export { complete } from "./client.js";
export { getLlamaConfig } from "./config.js";
export type { ChatMessage, CompleteOptions } from "./schema.js";
