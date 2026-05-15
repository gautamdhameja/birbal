import { LlamaConfigSchema, LlamaEnvSchema } from "./schema.js";
import type { LlamaConfig } from "./schema.js";

export function getLlamaConfig(): LlamaConfig {
  const env = LlamaEnvSchema.parse({
    LLAMA_SERVER_URL: process.env.LLAMA_SERVER_URL,
    LLAMA_MODEL: process.env.LLAMA_MODEL,
  });

  return LlamaConfigSchema.parse({
    serverUrl: env.LLAMA_SERVER_URL,
    model: env.LLAMA_MODEL,
  });
}
