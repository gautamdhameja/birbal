import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AGENT, LLAMA } from "../src/constants.js";
import { LlamaChatCompletionRequestSchema, LlamaConfigSchema } from "../src/llama/schema.js";

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
        LlamaConfigSchema.parse({ serverUrl: "http://user:pass@localhost:8080", model: "local" }),
      /must use http or https/,
    );
  });
});
