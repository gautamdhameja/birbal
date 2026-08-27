import { z } from "zod";

import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import type { ModelClient } from "../../framework/llm/types.js";
import { createLlamaCppModelAdapter } from "../llama/adapter.js";
import { createOpenAIModelAdapter } from "./openai/adapter.js";
import type { OpenAICompatibleClientDependencies } from "./openai-compatible/client.js";

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

function selectConfiguredModelClient(clients: Record<ModelProviderId, ModelClient>): ModelClient {
  const providerId = getConfiguredModelProviderId();
  switch (providerId) {
    case MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP:
      return clients[MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP];
    case MODEL_PROVIDERS.PROVIDERS.OPENAI:
      return clients[MODEL_PROVIDERS.PROVIDERS.OPENAI];
    default:
      throw new Error(`${MODEL_PROVIDERS.ERRORS.UNSUPPORTED_PROVIDER}: ${providerId}`);
  }
}

export function getDefaultModelClient(
  dependencies: OpenAICompatibleClientDependencies = {},
): ModelClient {
  const clients: Record<ModelProviderId, ModelClient> = {
    [MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP]: createLlamaCppModelAdapter(dependencies),
    [MODEL_PROVIDERS.PROVIDERS.OPENAI]: createOpenAIModelAdapter(dependencies),
  };

  return {
    complete(messages, options) {
      return selectConfiguredModelClient(clients).complete(messages, options);
    },
  };
}
