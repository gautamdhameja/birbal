// Purpose: Loads hosted OpenAI model provider configuration.
// Scope: Reads OpenAI-specific environment variables and maps them to the generic transport config.

import { MODEL_PROVIDERS } from "../../constants/model-providers.js";
import { OpenAIConfigSchema, OpenAIEnvSchema } from "./schema.js";
import type { OpenAIConfig } from "./schema.js";

export function getOpenAIConfig(): OpenAIConfig {
  const env = OpenAIEnvSchema.parse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_SERVER_URL: process.env.OPENAI_SERVER_URL,
    OPENAI_REQUEST_TIMEOUT_MS: process.env.OPENAI_REQUEST_TIMEOUT_MS,
  });

  return OpenAIConfigSchema.parse({
    providerId: MODEL_PROVIDERS.PROVIDERS.OPENAI,
    serverUrl: env.OPENAI_SERVER_URL,
    model: env.OPENAI_MODEL,
    requestTimeoutMs: env.OPENAI_REQUEST_TIMEOUT_MS,
    apiKey: env.OPENAI_API_KEY,
  });
}
