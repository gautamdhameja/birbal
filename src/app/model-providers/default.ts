import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import type { ModelClient } from "../../framework/llm/types.js";
import { createLlamaCppModelAdapter } from "../llama/adapter.js";
import { createAppleModelAdapter } from "./apple/adapter.js";
import { getConfiguredModelProviderId } from "./config.js";
import type { ModelProviderId } from "./config.js";
import { createOpenAIModelAdapter } from "./openai/adapter.js";
import type { OpenAICompatibleClientDependencies } from "./openai-compatible/types.js";

export { getConfiguredModelProviderId };
export type { ModelProviderId };

function selectConfiguredModelClient(clients: Record<ModelProviderId, ModelClient>): ModelClient {
  return clients[getConfiguredModelProviderId()];
}

export function getDefaultModelClient(
  dependencies: OpenAICompatibleClientDependencies = {},
): ModelClient {
  const clients: Record<ModelProviderId, ModelClient> = {
    [MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP]: createLlamaCppModelAdapter(dependencies),
    [MODEL_PROVIDERS.PROVIDERS.APPLE]: createAppleModelAdapter(dependencies),
    [MODEL_PROVIDERS.PROVIDERS.OPENAI]: createOpenAIModelAdapter(dependencies),
  };

  return {
    complete(messages, options) {
      return selectConfiguredModelClient(clients).complete(messages, options);
    },
  };
}
