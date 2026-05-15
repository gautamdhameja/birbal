import { z } from "zod";

export const ChatMessageSchema = z.strictObject({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export const CompleteOptionsSchema = z.strictObject({
  temperature: z.number().optional(),
  max_tokens: z.number().int().positive().optional(),
});

export const LlamaChatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      }),
    )
    .min(1),
});

export const LlamaEnvSchema = z.strictObject({
  LLAMA_SERVER_URL: z.url(),
  LLAMA_MODEL: z.string().min(1),
});

export const LlamaConfigSchema = z.strictObject({
  serverUrl: z.url(),
  model: z.string().min(1),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type CompleteOptions = z.infer<typeof CompleteOptionsSchema>;
export type LlamaChatCompletionResponse = z.infer<typeof LlamaChatCompletionResponseSchema>;
export type LlamaConfig = z.infer<typeof LlamaConfigSchema>;
