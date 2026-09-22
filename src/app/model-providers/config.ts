import { z } from "zod";

import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import { OpenAICompatibleConfigSchema } from "./openai-compatible/schema.js";
import type { OpenAICompatibleConfig } from "./openai-compatible/schema.js";

const ModelProviderEnvSchema = z.strictObject({
  MODEL_PROVIDER: z
    .enum([
      MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP,
      MODEL_PROVIDERS.PROVIDERS.APPLE,
      MODEL_PROVIDERS.PROVIDERS.OPENAI,
    ])
    .default(MODEL_PROVIDERS.DEFAULT_PROVIDER),
});

export type ModelProviderId = z.infer<typeof ModelProviderEnvSchema>["MODEL_PROVIDER"];

type OpenAICompatibleProviderConfigOptions = {
  providerId: string;
  defaultBaseUrl: string;
  defaultModel?: string;
  requiresApiKey?: boolean;
  outputTokenParameter?: (typeof MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS)[keyof typeof MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS];
};

export function trimmedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getConfiguredModelProviderId(): ModelProviderId {
  return ModelProviderEnvSchema.parse({
    MODEL_PROVIDER: process.env.MODEL_PROVIDER,
  }).MODEL_PROVIDER;
}

export function getOpenAICompatibleProviderConfig({
  providerId,
  defaultBaseUrl,
  defaultModel,
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
    model: trimmedEnv("MODEL_NAME") ?? defaultModel ?? "",
    requestTimeoutMs: Number(
      trimmedEnv("MODEL_REQUEST_TIMEOUT_MS") ?? MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS,
    ),
    ...(apiKey ? { apiKey } : {}),
  });
}
