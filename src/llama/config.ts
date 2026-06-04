// Purpose: Loads llama.cpp model provider configuration.
// Scope: Supplies llama.cpp defaults to the shared OpenAI-compatible provider config.

import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import { getOpenAICompatibleProviderConfig } from "../model-providers/config.js";
import { LlamaConfigSchema } from "./schema.js";
import type { LlamaConfig } from "./schema.js";

export function getLlamaConfig(): LlamaConfig {
  return LlamaConfigSchema.parse(
    getOpenAICompatibleProviderConfig({
      providerId: MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP,
      defaultBaseUrl: MODEL_PROVIDERS.DEFAULT_LLAMA_BASE_URL,
    }),
  );
}
