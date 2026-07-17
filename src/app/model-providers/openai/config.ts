// Purpose: Loads hosted OpenAI model provider configuration.
// Scope: Supplies OpenAI defaults to the shared OpenAI-compatible provider config.

import { MODEL_PROVIDERS } from "../../constants/model-providers.js";
import { getOpenAICompatibleProviderConfig } from "../config.js";
import { OpenAIConfigSchema } from "./schema.js";
import type { OpenAIConfig } from "./schema.js";

export function getOpenAIConfig(): OpenAIConfig {
  return OpenAIConfigSchema.parse(
    getOpenAICompatibleProviderConfig({
      providerId: MODEL_PROVIDERS.PROVIDERS.OPENAI,
      defaultBaseUrl: MODEL_PROVIDERS.DEFAULT_OPENAI_BASE_URL,
      requiresApiKey: true,
      outputTokenParameter: MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_COMPLETION_TOKENS,
    }),
  );
}
