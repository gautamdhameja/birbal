import { getLlamaConfig } from "./config.js";
import {
  CompleteOptionsSchema,
  LlamaChatCompletionRequestSchema,
  LlamaChatCompletionResponseSchema,
} from "./schema.js";
import type { ChatMessage, CompleteOptions } from "./schema.js";

export async function complete(
  messages: ChatMessage[],
  options: CompleteOptions = {},
): Promise<string> {
  const { serverUrl, model } = getLlamaConfig();
  const parsedOptions = CompleteOptionsSchema.parse(options);
  const requestBody = LlamaChatCompletionRequestSchema.parse({
    model,
    messages,
    temperature: parsedOptions.temperature,
    max_tokens: parsedOptions.max_tokens,
  });

  let response: Response;
  try {
    response = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to reach llama-server at ${serverUrl}: ${message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "<failed to read response body>");
    throw new Error(
      `llama-server request failed with HTTP ${response.status} ${response.statusText}: ${body}`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`llama-server returned invalid JSON: ${message}`);
  }

  const parsedPayload = LlamaChatCompletionResponseSchema.safeParse(payload);
  if (!parsedPayload.success) {
    throw new Error(
      `llama-server returned an invalid chat completions response shape: ${parsedPayload.error.message}`,
    );
  }

  const parsed = parsedPayload.data;
  const firstChoice = parsed.choices[0];
  if (!firstChoice) {
    throw new Error("llama-server returned no chat completion choices.");
  }

  return firstChoice.message.content;
}
