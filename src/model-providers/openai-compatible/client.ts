// Purpose: Implements a raw HTTP OpenAI-compatible chat completion client.
// Scope: Handles provider-neutral request building, auth headers, response validation, and tracing.

import { randomUUID } from "node:crypto";

import { MODEL_PROVIDERS } from "../../constants/model-providers.js";
import { HTTP } from "../../constants/runtime.js";
import { fetchWithTimeout } from "../../framework/network/fetch.js";
import type { ModelClient } from "../../framework/llm/types.js";
import { buildHttpStatusError, readResponseJson } from "../../http/client.js";
import { logger } from "../../logging/logger.js";
import {
  CompleteOptionsSchema,
  OpenAICompatibleChatCompletionRequestSchema,
  OpenAICompatibleChatCompletionResponseSchema,
  OpenAICompatibleConfigSchema,
} from "./schema.js";
import type { ChatMessage, CompleteOptions, OpenAICompatibleConfig } from "./schema.js";

type TokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

const MODEL_LOG_EVENTS = {
  STARTED: "model.complete.started",
  FINISHED: "model.complete.finished",
  FAILED: "model.complete.failed",
} as const;

const MODEL_LOG_MESSAGES = {
  STARTED: "model completion started",
  FINISHED: "model completion finished",
  FAILED: "model completion failed",
} as const;

function logCompletionStarted(
  modelCallId: string,
  config: OpenAICompatibleConfig,
  messages: ChatMessage[],
  options: CompleteOptions,
  startedAt: Date,
): void {
  logger.debug(
    {
      event: MODEL_LOG_EVENTS.STARTED,
      providerId: config.providerId,
      modelCallId,
      traceId: options.traceId,
      traceLabel: options.traceLabel,
      model: config.model,
      startedAt: startedAt.toISOString(),
      messageCount: messages.length,
      inputChars: messages.reduce((sum, message) => sum + message.content.length, 0),
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens,
      outputTokenParameter: config.outputTokenParameter,
      responseFormat: options.response_format?.type,
    },
    MODEL_LOG_MESSAGES.STARTED,
  );
}

function logCompletionFinished(
  modelCallId: string,
  config: OpenAICompatibleConfig,
  options: CompleteOptions,
  startedAt: Date,
  output: string,
  usage?: TokenUsage,
): void {
  const finishedAt = new Date();
  logger.debug(
    {
      event: MODEL_LOG_EVENTS.FINISHED,
      providerId: config.providerId,
      modelCallId,
      traceId: options.traceId,
      traceLabel: options.traceLabel,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      outputChars: output.length,
      ...(usage
        ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          }
        : {}),
    },
    MODEL_LOG_MESSAGES.FINISHED,
  );
}

function logCompletionFailed(
  modelCallId: string,
  config: OpenAICompatibleConfig,
  options: CompleteOptions,
  startedAt: Date,
  error: unknown,
): void {
  const finishedAt = new Date();
  logger.warn(
    {
      event: MODEL_LOG_EVENTS.FAILED,
      providerId: config.providerId,
      modelCallId,
      traceId: options.traceId,
      traceLabel: options.traceLabel,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      error: error instanceof Error ? error.message : String(error),
    },
    MODEL_LOG_MESSAGES.FAILED,
  );
}

function requestHeaders(config: OpenAICompatibleConfig): Record<string, string> {
  return {
    [HTTP.CONTENT_TYPE_HEADER]: HTTP.JSON_CONTENT_TYPE,
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  };
}

export function chatCompletionsUrl(config: OpenAICompatibleConfig): string {
  return new URL(config.chatCompletionsPath, config.baseUrl).toString();
}

function buildChatCompletionRequest(
  config: OpenAICompatibleConfig,
  messages: ChatMessage[],
  options: CompleteOptions,
) {
  return OpenAICompatibleChatCompletionRequestSchema.parse({
    model: config.model,
    messages,
    temperature: options.temperature,
    ...(options.maxOutputTokens ? { [config.outputTokenParameter]: options.maxOutputTokens } : {}),
    response_format: options.response_format,
  });
}

export function createOpenAICompatibleModelClient(
  loadConfig: () => OpenAICompatibleConfig,
): ModelClient {
  return {
    async complete(messages, options = {}) {
      const config = OpenAICompatibleConfigSchema.parse(loadConfig());
      const parsedOptions = CompleteOptionsSchema.parse(options);
      const modelCallId = randomUUID();
      const startedAt = new Date();
      logCompletionStarted(modelCallId, config, messages, parsedOptions, startedAt);

      const requestBody = buildChatCompletionRequest(config, messages, parsedOptions);
      const endpointUrl = chatCompletionsUrl(config);

      let response: Response;
      try {
        response = await fetchWithTimeout(
          endpointUrl,
          {
            method: HTTP.POST_METHOD,
            headers: requestHeaders(config),
            body: JSON.stringify(requestBody),
          },
          { timeoutMs: config.requestTimeoutMs },
        );
      } catch (error) {
        logCompletionFailed(modelCallId, config, parsedOptions, startedAt, error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `${MODEL_PROVIDERS.ERRORS.REQUEST_FAILED_PREFIX} ${endpointUrl}: ${message}`,
        );
      }

      if (!response.ok) {
        const error = await buildHttpStatusError(
          MODEL_PROVIDERS.ERRORS.HTTP_FAILED_PREFIX,
          response,
        );
        logCompletionFailed(modelCallId, config, parsedOptions, startedAt, error);
        throw error;
      }

      let payload: unknown;
      try {
        payload = await readResponseJson(response);
      } catch (error) {
        logCompletionFailed(modelCallId, config, parsedOptions, startedAt, error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${MODEL_PROVIDERS.ERRORS.INVALID_JSON_PREFIX} ${message}`);
      }

      const parsedPayload = OpenAICompatibleChatCompletionResponseSchema.safeParse(payload);
      if (!parsedPayload.success) {
        const error = new Error(
          `${MODEL_PROVIDERS.ERRORS.INVALID_SHAPE_PREFIX} ${parsedPayload.error.message}`,
        );
        logCompletionFailed(modelCallId, config, parsedOptions, startedAt, error);
        throw error;
      }

      const firstChoice = parsedPayload.data.choices[0];
      if (!firstChoice) {
        const error = new Error(MODEL_PROVIDERS.ERRORS.NO_CHOICES);
        logCompletionFailed(modelCallId, config, parsedOptions, startedAt, error);
        throw error;
      }

      const output = firstChoice.message.content;
      logCompletionFinished(
        modelCallId,
        config,
        parsedOptions,
        startedAt,
        output,
        parsedPayload.data.usage,
      );

      return output;
    },
  };
}
