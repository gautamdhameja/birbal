import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import type { ModelClient } from "../../framework/llm/types.js";
import { getLlamaConfig } from "../llama/config.js";
import { getAppleConfig } from "./apple/config.js";
import { getConfiguredModelProviderId } from "./config.js";
import { getOpenAIConfig } from "./openai/config.js";
import { createOpenAICompatibleModelClient } from "./openai-compatible/client.js";
import type { OpenAICompatibleClientDependencies } from "./openai-compatible/types.js";

export { getConfiguredModelProviderId };

const CONFIG_LOADERS = {
  [MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP]: getLlamaConfig,
  [MODEL_PROVIDERS.PROVIDERS.APPLE]: getAppleConfig,
  [MODEL_PROVIDERS.PROVIDERS.OPENAI]: getOpenAIConfig,
};

export function getDefaultModelClient(
  dependencies: OpenAICompatibleClientDependencies = {},
): ModelClient {
  return createOpenAICompatibleModelClient(
    () => CONFIG_LOADERS[getConfiguredModelProviderId()](),
    dependencies,
  );
}
