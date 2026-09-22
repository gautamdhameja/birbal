import { MODEL_PROVIDERS } from "../../constants/model-providers.js";
import { getOpenAICompatibleProviderConfig } from "../config.js";
import { AppleConfigSchema } from "./schema.js";
import type { AppleConfig } from "./schema.js";

export function getAppleConfig(): AppleConfig {
  return AppleConfigSchema.parse(
    getOpenAICompatibleProviderConfig({
      providerId: MODEL_PROVIDERS.PROVIDERS.APPLE,
      defaultBaseUrl: MODEL_PROVIDERS.DEFAULT_APPLE_BASE_URL,
      defaultModel: MODEL_PROVIDERS.DEFAULT_APPLE_MODEL,
    }),
  );
}
