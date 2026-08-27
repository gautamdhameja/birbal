import type { ModelClient } from "../../../framework/llm/types.js";
import { createOpenAICompatibleModelClient } from "../openai-compatible/client.js";
import type { OpenAICompatibleClientDependencies } from "../openai-compatible/client.js";
import { getOpenAIConfig } from "./config.js";

export function createOpenAIModelAdapter(
  dependencies: OpenAICompatibleClientDependencies = {},
): ModelClient {
  return createOpenAICompatibleModelClient(getOpenAIConfig, dependencies);
}

export const openAIModelAdapter: ModelClient = createOpenAIModelAdapter();
