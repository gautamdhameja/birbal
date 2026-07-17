import type { ModelClient } from "../../framework/llm/types.js";
import { createOpenAICompatibleModelClient } from "../model-providers/openai-compatible/client.js";
import { getLlamaConfig } from "./config.js";

export const llamaCppModelAdapter: ModelClient = createOpenAICompatibleModelClient(getLlamaConfig);
