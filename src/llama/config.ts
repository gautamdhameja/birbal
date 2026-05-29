// Purpose: Implements the llama.cpp model integration: config.
// Scope: Adapts the local OpenAI-compatible server to framework model contracts.

import { LlamaConfigSchema, LlamaEnvSchema } from "./schema.js";
import type { LlamaConfig } from "./schema.js";

export function getLlamaConfig(): LlamaConfig {
  const env = LlamaEnvSchema.parse({
    LLAMA_SERVER_URL: process.env.LLAMA_SERVER_URL,
    LLAMA_MODEL: process.env.LLAMA_MODEL,
    LLAMA_REQUEST_TIMEOUT_MS: process.env.LLAMA_REQUEST_TIMEOUT_MS,
  });

  return LlamaConfigSchema.parse({
    serverUrl: env.LLAMA_SERVER_URL,
    model: env.LLAMA_MODEL,
    requestTimeoutMs: env.LLAMA_REQUEST_TIMEOUT_MS,
  });
}
