import { z } from "zod";

import { MODEL_PROVIDERS } from "../../constants/model-providers.js";
import { OpenAICompatibleConfigSchema } from "../openai-compatible/schema.js";

export const OpenAIConfigSchema = OpenAICompatibleConfigSchema.extend({
  providerId: z.literal(MODEL_PROVIDERS.PROVIDERS.OPENAI),
  apiKey: z.string().trim().min(1),
});

export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;
