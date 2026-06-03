// Purpose: Loads llama.cpp model provider configuration.
// Scope: Keeps local OpenAI-compatible llama.cpp env handling separate from generic transport.

import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import { LlamaConfigSchema, LlamaEnvSchema } from "./schema.js";
import type { LlamaConfig } from "./schema.js";

export function getLlamaConfig(): LlamaConfig {
  const env = LlamaEnvSchema.parse({
    LLAMA_SERVER_URL: process.env.LLAMA_SERVER_URL,
    LLAMA_MODEL: process.env.LLAMA_MODEL,
    LLAMA_REQUEST_TIMEOUT_MS: process.env.LLAMA_REQUEST_TIMEOUT_MS,
  });

  return LlamaConfigSchema.parse({
    providerId: MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP,
    serverUrl: env.LLAMA_SERVER_URL,
    model: env.LLAMA_MODEL,
    requestTimeoutMs: env.LLAMA_REQUEST_TIMEOUT_MS,
  });
}
