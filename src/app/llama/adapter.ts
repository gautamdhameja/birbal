import { createOpenAICompatibleModelClient } from "../model-providers/openai-compatible/client.js";
import { getLlamaConfig } from "./config.js";

export const llamaCppModelAdapter = createOpenAICompatibleModelClient(getLlamaConfig);
