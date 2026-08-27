import { createOpenAICompatibleModelClient } from "../model-providers/openai-compatible/client.js";
import type { OpenAICompatibleClientDependencies } from "../model-providers/openai-compatible/client.js";
import { getLlamaConfig } from "./config.js";

export function createLlamaCppModelAdapter(dependencies: OpenAICompatibleClientDependencies = {}) {
  return createOpenAICompatibleModelClient(getLlamaConfig, dependencies);
}

export const llamaCppModelAdapter = createLlamaCppModelAdapter();
