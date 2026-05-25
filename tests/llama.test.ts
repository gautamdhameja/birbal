import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AGENT, LLAMA } from "../src/constants.js";
import {
  LlamaChatCompletionRequestSchema,
  LlamaConfigSchema,
  LlamaEnvSchema,
} from "../src/llama/schema.js";

describe("llama chat request schema", () => {
  it("allows JSON object response format requests", () => {
    assert.deepEqual(
      LlamaChatCompletionRequestSchema.parse({
        model: "local",
        messages: [
          {
            role: AGENT.ROLES.USER,
            content: "score this item",
          },
        ],
        response_format: {
          type: LLAMA.RESPONSE_FORMATS.JSON_OBJECT,
        },
      }),
      {
        model: "local",
        messages: [
          {
            role: AGENT.ROLES.USER,
            content: "score this item",
          },
        ],
        response_format: {
          type: LLAMA.RESPONSE_FORMATS.JSON_OBJECT,
        },
      },
    );
  });

  it("rejects llama URLs with credentials", () => {
    assert.throws(
      () =>
        LlamaConfigSchema.parse({
          serverUrl: "http://user:pass@localhost:8080",
          model: "local",
          requestTimeoutMs: LLAMA.DEFAULT_REQUEST_TIMEOUT_MS,
        }),
      /must use http or https/,
    );
  });

  it("defaults the llama request timeout from configuration schema", () => {
    assert.equal(
      LlamaEnvSchema.parse({
        LLAMA_SERVER_URL: "http://127.0.0.1:8080/v1/chat/completions",
        LLAMA_MODEL: "local",
      }).LLAMA_REQUEST_TIMEOUT_MS,
      LLAMA.DEFAULT_REQUEST_TIMEOUT_MS,
    );
  });
});
