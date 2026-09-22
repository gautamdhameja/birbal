import { FRAMEWORK_AGENT } from "../../framework/agent/constants.js";
import type { ModelCompleteOptions } from "../../framework/llm/types.js";

export const STRUCTURED_MODEL_COMPLETION_DEFAULTS = {
  temperature: 0,
  maxOutputTokens: FRAMEWORK_AGENT.MODEL_MAX_TOKENS,
} as const satisfies ModelCompleteOptions;
