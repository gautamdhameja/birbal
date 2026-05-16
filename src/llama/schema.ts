import { z } from "zod";

export const ChatMessageSchema = z.strictObject({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export const CompleteOptionsSchema = z.strictObject({
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
});

export const LlamaChatCompletionRequestSchema = z.strictObject({
  model: z.string().min(1),
  messages: ChatMessageSchema.array().min(1),
  temperature: CompleteOptionsSchema.shape.temperature,
  max_tokens: CompleteOptionsSchema.shape.max_tokens,
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
export type LlamaChatCompletionRequest = z.infer<typeof LlamaChatCompletionRequestSchema>;
export type LlamaChatCompletionResponse = z.infer<typeof LlamaChatCompletionResponseSchema>;
export type LlamaConfig = z.infer<typeof LlamaConfigSchema>;
