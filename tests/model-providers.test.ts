// Purpose: Tests model provider selection and OpenAI provider config.
// Scope: Covers provider-neutral wiring without making live network calls.

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { MODEL_PROVIDERS } from "../src/constants/model-providers.js";
import {
  getConfiguredModelProviderId,
  getDefaultModelClient,
} from "../src/model-providers/default.js";
import { getOpenAIConfig } from "../src/model-providers/openai/config.js";
import { OpenAIEnvSchema } from "../src/model-providers/openai/schema.js";

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
});

describe("OpenAI provider config", () => {
  afterEach(resetEnv);

  it("requires an API key", () => {
    assert.throws(
      () =>
        OpenAIEnvSchema.parse({
          OPENAI_MODEL: "gpt-test",
        }),
      /OPENAI_API_KEY/,
    );
  });

  it("loads hosted OpenAI config from environment variables", () => {
    process.env.MODEL_PROVIDER = MODEL_PROVIDERS.PROVIDERS.OPENAI;
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-test";

    assert.deepEqual(getOpenAIConfig(), {
      providerId: MODEL_PROVIDERS.PROVIDERS.OPENAI,
      serverUrl: MODEL_PROVIDERS.DEFAULT_OPENAI_SERVER_URL,
      model: "gpt-test",
      requestTimeoutMs: MODEL_PROVIDERS.DEFAULT_REQUEST_TIMEOUT_MS,
      apiKey: "test-key",
    });
  });
});
