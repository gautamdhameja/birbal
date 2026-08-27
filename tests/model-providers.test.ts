// Purpose: Tests model provider selection and OpenAI provider config.
// Scope: Covers provider-neutral wiring without making live network calls.

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { MODEL_PROVIDERS } from "../src/app/constants/model-providers.js";
import {
  getConfiguredModelProviderId,
  getDefaultModelClient,
} from "../src/app/model-providers/default.js";
import {
  chatCompletionsUrl,
  createOpenAICompatibleModelClient,
} from "../src/app/model-providers/openai-compatible/client.js";
import { getLlamaConfig } from "../src/app/llama/config.js";
import { getOpenAIConfig } from "../src/app/model-providers/openai/config.js";
import * as llamaAdapterModule from "../src/app/llama/adapter.js";
import * as openAIAdapterModule from "../src/app/model-providers/openai/adapter.js";

const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
  process.env = { ...ORIGINAL_ENV };
}

describe("model provider selection", () => {
  afterEach(resetEnv);

  it("defaults to llama.cpp", () => {
    delete process.env.MODEL_PROVIDER;

    assert.equal(getConfiguredModelProviderId(), MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP);
  });

  it("selects the OpenAI adapter when configured", () => {
    process.env.MODEL_PROVIDER = MODEL_PROVIDERS.PROVIDERS.OPENAI;

    assert.equal(getConfiguredModelProviderId(), MODEL_PROVIDERS.PROVIDERS.OPENAI);
    assert.equal(typeof getDefaultModelClient().complete, "function");
  });

  it("exposes model factories without module-level default adapters", () => {
    assert.equal("llamaCppModelAdapter" in llamaAdapterModule, false);
    assert.equal("openAIModelAdapter" in openAIAdapterModule, false);
  });
});

describe("OpenAI provider config", () => {
  afterEach(resetEnv);

  it("requires an API key", () => {
    process.env.MODEL_NAME = "gpt-test";

    assert.throws(() => getOpenAIConfig(), /MODEL_API_KEY/);
  });

  it("loads hosted OpenAI config from common model environment variables", () => {
    process.env.MODEL_PROVIDER = MODEL_PROVIDERS.PROVIDERS.OPENAI;
    process.env.MODEL_API_KEY = "test-key";
    process.env.MODEL_NAME = "gpt-test";

    assert.deepEqual(getOpenAIConfig(), {
      providerId: MODEL_PROVIDERS.PROVIDERS.OPENAI,
      baseUrl: MODEL_PROVIDERS.DEFAULT_OPENAI_BASE_URL,
      chatCompletionsPath: MODEL_PROVIDERS.CHAT_COMPLETIONS_PATH,
      outputTokenParameter: MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_COMPLETION_TOKENS,
      model: "gpt-test",
      requestTimeoutMs: MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS,
      apiKey: "test-key",
    });
  });
});

describe("OpenAI-compatible provider config", () => {
  afterEach(resetEnv);

  it("loads llama.cpp defaults with common model variables", () => {
    process.env.MODEL_NAME = "local";

    assert.deepEqual(getLlamaConfig(), {
      providerId: MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP,
      baseUrl: MODEL_PROVIDERS.DEFAULT_LLAMA_BASE_URL,
      chatCompletionsPath: MODEL_PROVIDERS.CHAT_COMPLETIONS_PATH,
      outputTokenParameter: MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_TOKENS,
      model: "local",
      requestTimeoutMs: MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS,
    });
  });

  it("composes the common chat completions path from the provider base URL", () => {
    assert.equal(
      chatCompletionsUrl({
        providerId: MODEL_PROVIDERS.PROVIDERS.OPENAI,
        baseUrl: "https://api.openai.com",
        chatCompletionsPath: MODEL_PROVIDERS.CHAT_COMPLETIONS_PATH,
        outputTokenParameter: MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_COMPLETION_TOKENS,
        model: "gpt-test",
        requestTimeoutMs: MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS,
        apiKey: "test-key",
      }),
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("sends max_completion_tokens for hosted OpenAI chat completions", async () => {
    let requestBody: unknown;
    const client = createOpenAICompatibleModelClient(
      () => ({
        providerId: MODEL_PROVIDERS.PROVIDERS.OPENAI,
        baseUrl: "https://api.openai.com",
        chatCompletionsPath: MODEL_PROVIDERS.CHAT_COMPLETIONS_PATH,
        outputTokenParameter: MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_COMPLETION_TOKENS,
        model: "gpt-test",
        requestTimeoutMs: MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS,
        apiKey: "test-key",
      }),
      {
        transport: async (_input, init) => {
          requestBody = JSON.parse(String(init?.body));
          return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
            status: 200,
          });
        },
      },
    );

    await client.complete([{ role: "user", content: "hello" }], { maxOutputTokens: 123 });

    assert.deepEqual(requestBody, {
      model: "gpt-test",
      messages: [{ role: "user", content: "hello" }],
      max_completion_tokens: 123,
    });
  });

  it("keeps max_tokens for local llama.cpp-compatible chat completions", async () => {
    let requestBody: unknown;
    let fetchCalls = 0;
    const client = createOpenAICompatibleModelClient(
      () => ({
        providerId: MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP,
        baseUrl: "http://127.0.0.1:8080",
        chatCompletionsPath: MODEL_PROVIDERS.CHAT_COMPLETIONS_PATH,
        outputTokenParameter: MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_TOKENS,
        model: "local",
        requestTimeoutMs: MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS,
      }),
      {
        transport: async (_input, init) => {
          fetchCalls += 1;
          requestBody = JSON.parse(String(init?.body));
          return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
            status: 200,
          });
        },
      },
    );

    assert.equal(
      await client.complete([{ role: "user", content: "hello" }], { maxOutputTokens: 123 }),
      "ok",
    );

    assert.deepEqual(requestBody, {
      model: "local",
      messages: [{ role: "user", content: "hello" }],
      max_tokens: 123,
    });
    assert.equal(fetchCalls, 1);
  });

  it("preserves detailed completion diagnostics without changing complete output", async () => {
    const client = createOpenAICompatibleModelClient(
      () => ({
        providerId: MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP,
        baseUrl: "http://127.0.0.1:8080",
        chatCompletionsPath: MODEL_PROVIDERS.CHAT_COMPLETIONS_PATH,
        outputTokenParameter: MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_TOKENS,
        model: "local",
        requestTimeoutMs: MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS,
      }),
      {
        transport: async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: "",
                    reasoning_content: "Working through the requested object.",
                  },
                  finish_reason: "length",
                },
              ],
              usage: {
                prompt_tokens: 12,
                completion_tokens: 128,
                total_tokens: 140,
              },
            }),
            { status: 200 },
          ),
      },
    );

    assert.deepEqual(
      await client.completeDetailed([{ role: "user", content: "hello" }], {
        maxOutputTokens: 128,
      }),
      {
        content: "",
        reasoningContent: "Working through the requested object.",
        finishReason: "length",
        usage: {
          promptTokens: 12,
          completionTokens: 128,
          totalTokens: 140,
        },
      },
    );
    assert.equal(await client.complete([{ role: "user", content: "hello" }]), "");
  });

  it("normalizes nullable answer content while preserving diagnostics", async () => {
    let fetchCalls = 0;
    const client = createOpenAICompatibleModelClient(
      () => ({
        providerId: MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP,
        baseUrl: "http://127.0.0.1:8080",
        chatCompletionsPath: MODEL_PROVIDERS.CHAT_COMPLETIONS_PATH,
        outputTokenParameter: MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_TOKENS,
        model: "local",
        requestTimeoutMs: MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS,
      }),
      {
        transport: async () => {
          fetchCalls += 1;
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: { content: null, reasoning_content: "Reasoning only" },
                  finish_reason: "length",
                },
              ],
              usage: { completion_tokens: 128 },
            }),
            { status: 200 },
          );
        },
      },
    );

    assert.deepEqual(await client.completeDetailed([{ role: "user", content: "hello" }]), {
      content: "",
      reasoningContent: "Reasoning only",
      finishReason: "length",
      usage: { completionTokens: 128 },
    });
    assert.equal(await client.complete([{ role: "user", content: "hello" }]), "");
    assert.equal(fetchCalls, 2);
  });

  it("uses injected IDs, timing, logging, and transport deterministically", async () => {
    const logEvents: Array<Record<string, unknown>> = [];
    const times = [new Date("2026-08-27T10:00:00.000Z"), new Date("2026-08-27T10:00:00.025Z")];
    const client = createOpenAICompatibleModelClient(
      () => ({
        providerId: MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP,
        baseUrl: "http://127.0.0.1:8080",
        chatCompletionsPath: MODEL_PROVIDERS.CHAT_COMPLETIONS_PATH,
        outputTokenParameter: MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_TOKENS,
        model: "local",
        requestTimeoutMs: MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS,
      }),
      {
        createId: () => "model-call-1",
        now: () => times.shift() ?? new Date("2026-08-27T10:00:00.025Z"),
        logger: {
          debug(payload) {
            logEvents.push(payload);
          },
          warn(payload) {
            logEvents.push(payload);
          },
        },
        transport: async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
            status: 200,
          }),
      },
    );

    assert.equal(await client.complete([{ role: "user", content: "hello" }]), "ok");
    assert.deepEqual(
      logEvents.map(({ event, modelCallId, startedAt, finishedAt, durationMs }) => ({
        event,
        modelCallId,
        startedAt,
        finishedAt,
        durationMs,
      })),
      [
        {
          event: "model.complete.started",
          modelCallId: "model-call-1",
          startedAt: "2026-08-27T10:00:00.000Z",
          finishedAt: undefined,
          durationMs: undefined,
        },
        {
          event: "model.complete.finished",
          modelCallId: "model-call-1",
          startedAt: "2026-08-27T10:00:00.000Z",
          finishedAt: "2026-08-27T10:00:00.025Z",
          durationMs: 25,
        },
      ],
    );
  });
});
