import { FRAMEWORK_AGENT } from "../../framework/agent/constants.js";
import type { ModelCompleteOptions } from "../../framework/llm/types.js";
import { MODEL_PROVIDERS } from "./model-providers.js";

export const STRUCTURED_MODEL_COMPLETION_OPTIONS = {
  temperature: 0,
  maxOutputTokens: FRAMEWORK_AGENT.MODEL_MAX_TOKENS,
  response_format: {
    type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT,
  },
} as const satisfies ModelCompleteOptions;
