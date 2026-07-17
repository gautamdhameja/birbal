// Purpose: Selects the configured default model provider.
// Scope: Keeps application code independent of concrete model provider imports.

import { z } from "zod";

import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import type { ModelClient } from "../../framework/llm/types.js";
import { llamaCppModelAdapter } from "../llama/adapter.js";
import { openAIModelAdapter } from "./openai/adapter.js";

const ModelProviderEnvSchema = z.strictObject({
  MODEL_PROVIDER: z
    .enum([MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP, MODEL_PROVIDERS.PROVIDERS.OPENAI])
    .default(MODEL_PROVIDERS.DEFAULT_PROVIDER),
});

export type ModelProviderId = z.infer<typeof ModelProviderEnvSchema>["MODEL_PROVIDER"];

export function getConfiguredModelProviderId(): ModelProviderId {
  return ModelProviderEnvSchema.parse({
    MODEL_PROVIDER: process.env.MODEL_PROVIDER,
  }).MODEL_PROVIDER;
}

function selectConfiguredModelClient(): ModelClient {
  const providerId = getConfiguredModelProviderId();
  switch (providerId) {
    case MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP:
      return llamaCppModelAdapter;
    case MODEL_PROVIDERS.PROVIDERS.OPENAI:
      return openAIModelAdapter;
    default:
      throw new Error(`${MODEL_PROVIDERS.ERRORS.UNSUPPORTED_PROVIDER}: ${providerId}`);
  }
}

export function getDefaultModelClient(): ModelClient {
  return {
    complete(messages, options) {
      return selectConfiguredModelClient().complete(messages, options);
    },
  };
}
