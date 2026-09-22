import type { ModelClient } from "../../../framework/llm/types.js";
import { createOpenAICompatibleModelClient } from "../openai-compatible/client.js";
import type { OpenAICompatibleClientDependencies } from "../openai-compatible/types.js";
import { getAppleConfig } from "./config.js";

export function createAppleModelAdapter(
  dependencies: OpenAICompatibleClientDependencies = {},
): ModelClient {
  return createOpenAICompatibleModelClient(getAppleConfig, dependencies);
}
