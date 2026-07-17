import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import { getOpenAICompatibleProviderConfig } from "../model-providers/config.js";
import { LlamaConfigSchema } from "./schema.js";

export function getLlamaConfig() {
  return LlamaConfigSchema.parse(
    getOpenAICompatibleProviderConfig({
      providerId: MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP,
      defaultBaseUrl: MODEL_PROVIDERS.DEFAULT_LLAMA_BASE_URL,
    }),
  );
}
