import { z } from "zod";

import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import { OpenAICompatibleConfigSchema } from "../model-providers/openai-compatible/schema.js";

export const LlamaConfigSchema = OpenAICompatibleConfigSchema.extend({
  providerId: z.literal(MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP),
});
