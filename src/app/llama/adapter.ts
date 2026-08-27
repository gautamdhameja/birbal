import { createOpenAICompatibleModelClient } from "../model-providers/openai-compatible/client.js";
import type { OpenAICompatibleClientDependencies } from "../model-providers/openai-compatible/types.js";
import { getLlamaConfig } from "./config.js";

export function createLlamaCppModelAdapter(dependencies: OpenAICompatibleClientDependencies = {}) {
  return createOpenAICompatibleModelClient(getLlamaConfig, dependencies);
}
