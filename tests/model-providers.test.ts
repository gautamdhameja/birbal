import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";

import dotenv from "dotenv";
import { z } from "zod";

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
import { getAppleConfig } from "../src/app/model-providers/apple/config.js";
import { getOpenAIConfig } from "../src/app/model-providers/openai/config.js";
import { createStructuredModelCompletionOptions } from "../src/app/model-providers/response-format.js";

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

  it("routes the default client through the configured OpenAI provider", async () => {
    let requestUrl = "";
    let requestBody: unknown;
    process.env.MODEL_PROVIDER = MODEL_PROVIDERS.PROVIDERS.OPENAI;
    process.env.MODEL_API_KEY = "test-key";
    process.env.MODEL_NAME = "gpt-test";

    assert.equal(getConfiguredModelProviderId(), MODEL_PROVIDERS.PROVIDERS.OPENAI);
    assert.equal(
      await getDefaultModelClient({
        transport: async (input, init) => {
          requestUrl = String(input);
          requestBody = JSON.parse(String(init?.body));
          return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
            status: 200,
          });
        },
      }).complete([{ role: "user", content: "hello" }], { maxOutputTokens: 42 }),
      "ok",
    );
    assert.equal(requestUrl, "https://api.openai.com/v1/chat/completions");
    assert.deepEqual(requestBody, {
      model: "gpt-test",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
      max_completion_tokens: 42,
    });
  });

  it("routes the default client through llama.cpp defaults", async () => {
    let requestUrl = "";
    let requestBody: unknown;
    delete process.env.MODEL_PROVIDER;
    delete process.env.MODEL_BASE_URL;
    delete process.env.MODEL_NAME;

    assert.equal(
      await getDefaultModelClient({
        transport: async (input, init) => {
          requestUrl = String(input);
          requestBody = JSON.parse(String(init?.body));
          return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
            status: 200,
          });
        },
      }).complete([{ role: "user", content: "hello" }], { maxOutputTokens: 42 }),
      "ok",
    );
    assert.equal(requestUrl, "http://127.0.0.1:8080/v1/chat/completions");
    assert.deepEqual(requestBody, {
      model: "local",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
      max_tokens: 42,
    });
  });

  it("selects the Apple Foundation Models provider with fm serve defaults", async () => {
    let requestUrl = "";
    let requestBody: unknown;
    process.env.MODEL_PROVIDER = MODEL_PROVIDERS.PROVIDERS.APPLE;
    delete process.env.MODEL_API_KEY;
    delete process.env.MODEL_BASE_URL;
    delete process.env.MODEL_NAME;

    assert.equal(getConfiguredModelProviderId(), MODEL_PROVIDERS.PROVIDERS.APPLE);
    assert.equal(
      await getDefaultModelClient({
        transport: async (input, init) => {
          requestUrl = String(input);
          requestBody = JSON.parse(String(init?.body));
          return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
            status: 200,
          });
        },
      }).complete([{ role: "user", content: "hello" }]),
      "ok",
    );
    assert.equal(requestUrl, "http://127.0.0.1:1976/v1/chat/completions");
    assert.deepEqual(requestBody, {
      model: "system",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
    });
  });
});

describe("Apple Foundation Models provider config", () => {
  afterEach(resetEnv);

  it("loads fm serve defaults without requiring common model variables", () => {
    delete process.env.MODEL_API_KEY;
    delete process.env.MODEL_BASE_URL;
    delete process.env.MODEL_NAME;

    assert.deepEqual(getAppleConfig(), {
      providerId: MODEL_PROVIDERS.PROVIDERS.APPLE,
      baseUrl: MODEL_PROVIDERS.DEFAULT_APPLE_BASE_URL,
      chatCompletionsPath: MODEL_PROVIDERS.CHAT_COMPLETIONS_PATH,
      outputTokenParameter: MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_TOKENS,
      model: MODEL_PROVIDERS.DEFAULT_APPLE_MODEL,
      requestTimeoutMs: MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS,
    });
  });

  it("allows common model variables to override Apple defaults", () => {
    process.env.MODEL_BASE_URL = "http://127.0.0.1:2987";
    process.env.MODEL_NAME = "custom-system";

    assert.deepEqual(getAppleConfig(), {
      providerId: MODEL_PROVIDERS.PROVIDERS.APPLE,
      baseUrl: "http://127.0.0.1:2987",
      chatCompletionsPath: MODEL_PROVIDERS.CHAT_COMPLETIONS_PATH,
      outputTokenParameter: MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_TOKENS,
      model: "custom-system",
      requestTimeoutMs: MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS,
    });
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
    delete process.env.MODEL_BASE_URL;
    delete process.env.MODEL_NAME;

    assert.deepEqual(getLlamaConfig(), {
      providerId: MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP,
      baseUrl: MODEL_PROVIDERS.DEFAULT_LLAMA_BASE_URL,
      chatCompletionsPath: MODEL_PROVIDERS.CHAT_COMPLETIONS_PATH,
      outputTokenParameter: MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_TOKENS,
      model: MODEL_PROVIDERS.DEFAULT_LLAMA_MODEL,
      requestTimeoutMs: MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS,
    });
  });

  it("lets a copied example environment switch cleanly to Apple defaults", () => {
    process.env = {
      ...ORIGINAL_ENV,
      ...dotenv.parse(readFileSync(new URL("../.env.example", import.meta.url))),
      MODEL_PROVIDER: MODEL_PROVIDERS.PROVIDERS.APPLE,
    };

    assert.equal(getConfiguredModelProviderId(), MODEL_PROVIDERS.PROVIDERS.APPLE);
    assert.equal(getAppleConfig().baseUrl, MODEL_PROVIDERS.DEFAULT_APPLE_BASE_URL);
    assert.equal(getAppleConfig().model, MODEL_PROVIDERS.DEFAULT_APPLE_MODEL);
    assert.equal(
      createStructuredModelCompletionOptions({
        name: "result",
        schema: z.strictObject({ result: z.string() }),
      }).response_format?.type,
      MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_SCHEMA,
    );
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
      stream: false,
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
      stream: false,
    });
    assert.equal(fetchCalls, 1);
  });

  it("sends JSON schema response formats with non-streaming responses", async () => {
    let requestBody: unknown;
    const client = createOpenAICompatibleModelClient(
      () => ({
        providerId: MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP,
        baseUrl: "http://127.0.0.1:1976",
        chatCompletionsPath: MODEL_PROVIDERS.CHAT_COMPLETIONS_PATH,
        outputTokenParameter: MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_TOKENS,
        model: "system",
        requestTimeoutMs: MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS,
      }),
      {
        transport: async (_input, init) => {
          requestBody = JSON.parse(String(init?.body));
          return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
            status: 200,
          });
        },
      },
    );
    const responseFormat = {
      type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_SCHEMA,
      json_schema: {
        name: "result",
        strict: true,
        schema: {
          type: "object",
          properties: { result: { type: "string" } },
          required: ["result"],
          additionalProperties: false,
        },
      },
    } as const;

    await client.complete([{ role: "user", content: "hello" }], {
      response_format: responseFormat,
    });

    assert.deepEqual(requestBody, {
      model: "system",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
      response_format: responseFormat,
    });
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

  it("does not build successful debug diagnostics when debug logging is disabled", async () => {
    let nowCalls = 0;
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
        now: () => {
          nowCalls += 1;
          return new Date("2026-08-27T10:00:00.000Z");
        },
        logger: {
          debug: () => assert.fail("debug logging should be disabled"),
          isLevelEnabled: () => false,
          warn: () => assert.fail("a successful request should not warn"),
        },
        transport: async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
            status: 200,
          }),
      },
    );

    assert.equal(await client.complete([{ role: "user", content: "hello" }]), "ok");
    assert.equal(nowCalls, 1);
  });
});

describe("structured model response format", () => {
  afterEach(resetEnv);

  const ResultSchema = z.strictObject({ result: z.string() });
  const AgentResponseSchema = z.union([
    z.strictObject({ type: z.literal("final"), answer: z.string() }),
    z.strictObject({
      type: z.literal("tool_call"),
      tool: z.literal("echo"),
      args: z.strictObject({ value: z.string().optional() }),
    }),
  ]);

  it("keeps JSON object response format as the compatibility default", () => {
    delete process.env.MODEL_PROVIDER;
    delete process.env.MODEL_RESPONSE_FORMAT;

    assert.deepEqual(
      createStructuredModelCompletionOptions({ name: "result", schema: ResultSchema })
        .response_format,
      { type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT },
    );
  });

  it("uses Apple JSON schema defaults for the Apple provider", () => {
    process.env.MODEL_PROVIDER = MODEL_PROVIDERS.PROVIDERS.APPLE;
    delete process.env.MODEL_RESPONSE_FORMAT;
    delete process.env.MODEL_JSON_SCHEMA_DIALECT;

    assert.deepEqual(
      createStructuredModelCompletionOptions({ name: "result", schema: ResultSchema })
        .response_format,
      {
        type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_SCHEMA,
        json_schema: {
          name: "result",
          strict: true,
          schema: {
            type: "object",
            properties: { result: { type: "string" } },
            required: ["result"],
            additionalProperties: false,
            title: "Result",
            "x-order": ["result"],
          },
        },
      },
    );
  });

  it("respects an explicit JSON object override for the Apple provider", () => {
    process.env.MODEL_PROVIDER = MODEL_PROVIDERS.PROVIDERS.APPLE;
    process.env.MODEL_RESPONSE_FORMAT = MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT;
    process.env.MODEL_JSON_SCHEMA_DIALECT = "unsupported";

    assert.deepEqual(
      createStructuredModelCompletionOptions({ name: "result", schema: ResultSchema })
        .response_format,
      { type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT },
    );
  });

  it("respects an explicit standard JSON schema dialect for the Apple provider", () => {
    process.env.MODEL_PROVIDER = MODEL_PROVIDERS.PROVIDERS.APPLE;
    process.env.MODEL_JSON_SCHEMA_DIALECT = MODEL_PROVIDERS.JSON_SCHEMA_DIALECTS.STANDARD;
    delete process.env.MODEL_RESPONSE_FORMAT;

    assert.deepEqual(
      createStructuredModelCompletionOptions({ name: "result", schema: ResultSchema })
        .response_format,
      {
        type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_SCHEMA,
        json_schema: {
          name: "result",
          strict: false,
          schema: {
            type: "object",
            properties: { result: { type: "string" } },
            required: ["result"],
            additionalProperties: false,
          },
        },
      },
    );
  });

  it("ignores JSON schema dialect configuration in JSON object mode", () => {
    process.env.MODEL_RESPONSE_FORMAT = MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT;
    process.env.MODEL_JSON_SCHEMA_DIALECT = "unsupported";

    assert.deepEqual(
      createStructuredModelCompletionOptions({ name: "result", schema: ResultSchema })
        .response_format,
      { type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT },
    );
  });

  it("builds a named JSON schema response format when configured", () => {
    process.env.MODEL_RESPONSE_FORMAT = MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_SCHEMA;

    assert.deepEqual(
      createStructuredModelCompletionOptions({ name: "result", schema: ResultSchema })
        .response_format,
      {
        type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_SCHEMA,
        json_schema: {
          name: "result",
          strict: false,
          schema: {
            type: "object",
            properties: {
              result: { type: "string" },
            },
            required: ["result"],
            additionalProperties: false,
          },
        },
      },
    );
  });

  it("normalizes standard root unions without claiming strict optional-field support", () => {
    process.env.MODEL_RESPONSE_FORMAT = MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_SCHEMA;

    assert.deepEqual(
      createStructuredModelCompletionOptions({
        name: "agent_response",
        schema: AgentResponseSchema,
      }).response_format,
      {
        type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_SCHEMA,
        json_schema: {
          name: "agent_response",
          strict: false,
          schema: {
            type: "object",
            properties: {
              type: {
                anyOf: [
                  { type: "string", const: "final" },
                  { type: "string", const: "tool_call" },
                ],
              },
              answer: { type: "string" },
              tool: { type: "string", const: "echo" },
              args: {
                type: "object",
                properties: { value: { type: "string" } },
                additionalProperties: false,
              },
            },
            required: ["type"],
            additionalProperties: false,
          },
        },
      },
    );
  });

  it("adapts root unions to the Apple Foundation Models schema dialect", () => {
    process.env.MODEL_RESPONSE_FORMAT = MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_SCHEMA;
    process.env.MODEL_JSON_SCHEMA_DIALECT = "apple";

    assert.deepEqual(
      createStructuredModelCompletionOptions({
        name: "agent_response",
        schema: AgentResponseSchema,
      }).response_format,
      {
        type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_SCHEMA,
        json_schema: {
          name: "agent_response",
          strict: true,
          schema: {
            anyOf: [
              { $ref: "#/$defs/AgentResponseOption1" },
              { $ref: "#/$defs/AgentResponseOption2" },
            ],
            title: "AgentResponse",
            $defs: {
              AgentResponseOption1: {
                type: "object",
                properties: {
                  type: { type: "string", const: "final" },
                  answer: { type: "string" },
                },
                required: ["type", "answer"],
                additionalProperties: false,
                title: "AgentResponseOption1",
                "x-order": ["type", "answer"],
              },
              AgentResponseOption2: {
                type: "object",
                properties: {
                  type: { type: "string", const: "tool_call" },
                  tool: { type: "string", const: "echo" },
                  args: {
                    type: "object",
                    properties: { value: { type: "string" } },
                    required: [],
                    additionalProperties: false,
                    title: "AgentResponseOption2Args",
                    "x-order": ["value"],
                  },
                },
                required: ["type", "tool", "args"],
                additionalProperties: false,
                title: "AgentResponseOption2",
                "x-order": ["type", "tool", "args"],
              },
            },
          },
        },
      },
    );
  });

  it("rejects unsupported response format configuration", () => {
    process.env.MODEL_RESPONSE_FORMAT = "yaml";

    assert.throws(
      () => createStructuredModelCompletionOptions({ name: "result", schema: ResultSchema }),
      /MODEL_RESPONSE_FORMAT/,
    );
  });

  it("rejects unsupported JSON schema dialect configuration in JSON schema mode", () => {
    process.env.MODEL_RESPONSE_FORMAT = MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_SCHEMA;
    process.env.MODEL_JSON_SCHEMA_DIALECT = "unsupported";

    assert.throws(
      () => createStructuredModelCompletionOptions({ name: "result", schema: ResultSchema }),
      /MODEL_JSON_SCHEMA_DIALECT/,
    );
  });
});
