import { LLAMA } from "../constants/llama.js";
import { HTTP } from "../constants/runtime.js";
import { buildHttpStatusError, fetchWithTimeout, readResponseJson } from "../http/client.js";
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
    response_format: parsedOptions.response_format,
  });

  let response: Response;
  try {
    response = await fetchWithTimeout(serverUrl, {
      method: HTTP.POST_METHOD,
      headers: {
        [HTTP.CONTENT_TYPE_HEADER]: HTTP.JSON_CONTENT_TYPE,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${LLAMA.ERRORS.REQUEST_FAILED_PREFIX} ${serverUrl}: ${message}`);
  }

  if (!response.ok) {
    throw await buildHttpStatusError(LLAMA.ERRORS.HTTP_FAILED_PREFIX, response);
  }

  let payload: unknown;
  try {
    payload = await readResponseJson(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${LLAMA.ERRORS.INVALID_JSON_PREFIX} ${message}`);
  }

  const parsedPayload = LlamaChatCompletionResponseSchema.safeParse(payload);
  if (!parsedPayload.success) {
    throw new Error(`${LLAMA.ERRORS.INVALID_SHAPE_PREFIX} ${parsedPayload.error.message}`);
  }

  const parsed = parsedPayload.data;
  const firstChoice = parsed.choices[0];
  if (!firstChoice) {
    throw new Error(LLAMA.ERRORS.NO_CHOICES);
  }

  return firstChoice.message.content;
}
