import { z } from "zod";

import { MODEL_PROVIDERS } from "../../constants/model-providers.js";
import { OpenAICompatibleConfigSchema } from "../openai-compatible/schema.js";

export const AppleConfigSchema = OpenAICompatibleConfigSchema.extend({
  providerId: z.literal(MODEL_PROVIDERS.PROVIDERS.APPLE),
});

export type AppleConfig = z.infer<typeof AppleConfigSchema>;
