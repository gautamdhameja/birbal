import type { ModelClient } from "../../../framework/llm/types.js";
import { createOpenAICompatibleModelClient } from "../openai-compatible/client.js";
import { getOpenAIConfig } from "./config.js";

export const openAIModelAdapter: ModelClient = createOpenAICompatibleModelClient(getOpenAIConfig);
