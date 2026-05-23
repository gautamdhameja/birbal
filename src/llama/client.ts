import { randomUUID } from "node:crypto";

import { LLAMA } from "../constants/llama.js";
import { HTTP } from "../constants/runtime.js";
import { buildHttpStatusError, fetchWithTimeout, readResponseJson } from "../http/client.js";
import { logger } from "../logging/logger.js";
import { getLlamaConfig } from "./config.js";
import {
  CompleteOptionsSchema,
  LlamaChatCompletionRequestSchema,
  LlamaChatCompletionResponseSchema,
} from "./schema.js";
import type { ChatMessage, CompleteOptions } from "./schema.js";

const LLAMA_LOG_EVENTS = {
  STARTED: "llama.complete.started",
  FINISHED: "llama.complete.finished",
  FAILED: "llama.complete.failed",
} as const;

const LLAMA_LOG_MESSAGES = {
  STARTED: "llama completion started",
  FINISHED: "llama completion finished",
  FAILED: "llama completion failed",
} as const;

function logCompletionStarted(
  modelCallId: string,
  model: string,
  messages: ChatMessage[],
  options: CompleteOptions,
  startedAt: Date,
): void {
  logger.debug(
    {
      event: LLAMA_LOG_EVENTS.STARTED,
      modelCallId,
      traceId: options.traceId,
      traceLabel: options.traceLabel,
      model,
      startedAt: startedAt.toISOString(),
      messageCount: messages.length,
      inputChars: messages.reduce((sum, message) => sum + message.content.length, 0),
      temperature: options.temperature,
      maxTokens: options.max_tokens,
      responseFormat: options.response_format?.type,
    },
    LLAMA_LOG_MESSAGES.STARTED,
  );
}

function logCompletionFinished(
  modelCallId: string,
  options: CompleteOptions,
  startedAt: Date,
  output: string,
): void {
  const finishedAt = new Date();
  logger.debug(
    {
      event: LLAMA_LOG_EVENTS.FINISHED,
      modelCallId,
      traceId: options.traceId,
      traceLabel: options.traceLabel,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      outputChars: output.length,
    },
    LLAMA_LOG_MESSAGES.FINISHED,
  );
}

function logCompletionFailed(
  modelCallId: string,
  options: CompleteOptions,
  startedAt: Date,
  error: unknown,
): void {
  const finishedAt = new Date();
  logger.warn(
    {
      event: LLAMA_LOG_EVENTS.FAILED,
      modelCallId,
      traceId: options.traceId,
      traceLabel: options.traceLabel,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      error: error instanceof Error ? error.message : String(error),
    },
    LLAMA_LOG_MESSAGES.FAILED,
  );
}

export async function complete(
  messages: ChatMessage[],
  options: CompleteOptions = {},
): Promise<string> {
  const { serverUrl, model } = getLlamaConfig();
  const parsedOptions = CompleteOptionsSchema.parse(options);
  const modelCallId = randomUUID();
  const startedAt = new Date();
  logCompletionStarted(modelCallId, model, messages, parsedOptions, startedAt);
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
    logCompletionFailed(modelCallId, parsedOptions, startedAt, error);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${LLAMA.ERRORS.REQUEST_FAILED_PREFIX} ${serverUrl}: ${message}`);
  }

  if (!response.ok) {
    const error = await buildHttpStatusError(LLAMA.ERRORS.HTTP_FAILED_PREFIX, response);
    logCompletionFailed(modelCallId, parsedOptions, startedAt, error);
    throw error;
  }

  let payload: unknown;
  try {
    payload = await readResponseJson(response);
  } catch (error) {
    logCompletionFailed(modelCallId, parsedOptions, startedAt, error);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${LLAMA.ERRORS.INVALID_JSON_PREFIX} ${message}`);
  }

  const parsedPayload = LlamaChatCompletionResponseSchema.safeParse(payload);
  if (!parsedPayload.success) {
    const error = new Error(`${LLAMA.ERRORS.INVALID_SHAPE_PREFIX} ${parsedPayload.error.message}`);
    logCompletionFailed(modelCallId, parsedOptions, startedAt, error);
    throw error;
  }

  const parsed = parsedPayload.data;
  const firstChoice = parsed.choices[0];
  if (!firstChoice) {
    const error = new Error(LLAMA.ERRORS.NO_CHOICES);
    logCompletionFailed(modelCallId, parsedOptions, startedAt, error);
    throw error;
  }

  const output = firstChoice.message.content;
  logCompletionFinished(modelCallId, parsedOptions, startedAt, output);

  return output;
}
