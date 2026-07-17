// Purpose: Tests llama behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FRAMEWORK_AGENT as AGENT } from "../src/framework/agent/constants.js";
import { MODEL_PROVIDERS } from "../src/app/constants/model-providers.js";
import { LlamaConfigSchema } from "../src/app/llama/schema.js";
import { OpenAICompatibleChatCompletionRequestSchema } from "../src/app/model-providers/openai-compatible/schema.js";

describe("llama chat request schema", () => {
  it("allows JSON object response format requests", () => {
    assert.deepEqual(
      OpenAICompatibleChatCompletionRequestSchema.parse({
        model: "local",
        messages: [
          {
            role: AGENT.ROLES.USER,
            content: "score this item",
          },
        ],
        response_format: {
          type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT,
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
          type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT,
        },
      },
    );
  });

  it("rejects llama URLs with credentials", () => {
    assert.throws(
      () =>
        LlamaConfigSchema.parse({
          providerId: MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP,
          baseUrl: "http://user:pass@localhost:8080",
          chatCompletionsPath: MODEL_PROVIDERS.CHAT_COMPLETIONS_PATH,
          outputTokenParameter: MODEL_PROVIDERS.OUTPUT_TOKEN_PARAMETERS.MAX_TOKENS,
          model: "local",
          requestTimeoutMs: MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS,
        }),
      /must use http or https/,
    );
  });
});
