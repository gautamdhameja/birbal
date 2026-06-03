// Purpose: Defines hosted OpenAI provider schemas.
// Scope: Validates OpenAI env/config while reusing the OpenAI-compatible transport contract.

import { z } from "zod";

import { MODEL_PROVIDERS } from "../../constants/model-providers.js";
import { httpUrlErrorMessage, isHttpUrlWithoutCredentials } from "../../http/url.js";
import { OpenAICompatibleConfigSchema } from "../openai-compatible/schema.js";

export const OpenAIEnvSchema = z.strictObject({
  OPENAI_API_KEY: z.string().trim().min(1, MODEL_PROVIDERS.ERRORS.OPENAI_API_KEY_REQUIRED),
  OPENAI_MODEL: z.string().trim().min(1),
  OPENAI_SERVER_URL: z
    .url()
    .refine(isHttpUrlWithoutCredentials, httpUrlErrorMessage())
    .default(MODEL_PROVIDERS.DEFAULT_OPENAI_SERVER_URL),
  OPENAI_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS),
});

export const OpenAIConfigSchema = OpenAICompatibleConfigSchema.extend({
  providerId: z.literal(MODEL_PROVIDERS.PROVIDERS.OPENAI),
  apiKey: z.string().trim().min(1),
});

export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;
