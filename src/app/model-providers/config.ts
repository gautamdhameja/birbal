// Purpose: Builds OpenAI-compatible model provider configs from common environment variables.
// Scope: Centralizes base URL, path, model name, timeout, and API key handling for providers.

import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import { OpenAICompatibleConfigSchema } from "./openai-compatible/schema.js";
import type { OpenAICompatibleConfig } from "./openai-compatible/schema.js";

type OpenAICompatibleProviderConfigOptions = {
  providerId: string;
  defaultBaseUrl: string;
  requiresApiKey?: boolean;
  outputTokenParameter?: (typeof MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS)[keyof typeof MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS];
};

function trimmedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getOpenAICompatibleProviderConfig({
  providerId,
  defaultBaseUrl,
  requiresApiKey = false,
  outputTokenParameter = MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_TOKENS,
}: OpenAICompatibleProviderConfigOptions): OpenAICompatibleConfig {
  const apiKey = trimmedEnv("MODEL_API_KEY");
  if (requiresApiKey && !apiKey) {
    throw new Error(MODEL_PROVIDERS.ERRORS.MODEL_API_KEY_REQUIRED);
  }

  return OpenAICompatibleConfigSchema.parse({
    providerId,
    baseUrl: trimmedEnv("MODEL_BASE_URL") ?? defaultBaseUrl,
    chatCompletionsPath: MODEL_PROVIDERS.CHAT_COMPLETIONS_PATH,
    outputTokenParameter,
    model: trimmedEnv("MODEL_NAME") ?? "",
    requestTimeoutMs: Number(
      trimmedEnv("MODEL_REQUEST_TIMEOUT_MS") ?? MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS,
    ),
    ...(apiKey ? { apiKey } : {}),
  });
}
