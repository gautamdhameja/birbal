import type { EvalCase, EvalSuite } from "../../../framework/evals/types.js";
import ipaddr from "ipaddr.js";
import { z } from "zod";

import { MODEL_PROVIDERS } from "../../constants/model-providers.js";
import { llamaCppModelAdapter } from "../../llama/adapter.js";
import { getLlamaConfig } from "../../llama/config.js";
import { getConfiguredModelProviderId } from "../../model-providers/default.js";
import { expectEqual, expectTrue } from "../assertions.js";
import { LOCAL_MODEL_SMOKE_EVAL_SUITE_ID } from "../constants.js";

const LocalModelSmokeResponseSchema = z.strictObject({
  ok: z.literal(true),
});

function isLoopbackUrl(value: string): boolean {
  const hostname = new URL(value).hostname.replace(/^\[|\]$/gu, "");
  if (hostname === "localhost") {
    return true;
  }

  try {
    return ipaddr.parse(hostname).range() === "loopback";
  } catch {
    return false;
  }
}

const localModelCase: EvalCase = {
  id: "local_model_returns_structured_content",
  name: "returns nonempty structured content from the configured local model",
  async run() {
    const providerId = getConfiguredModelProviderId();
    if (providerId !== MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP) {
      throw new Error(
        `Local-model smoke eval requires MODEL_PROVIDER=${MODEL_PROVIDERS.PROVIDERS.LLAMA_CPP}.`,
      );
    }

    const config = getLlamaConfig();
    if (!isLoopbackUrl(config.baseUrl)) {
      throw new Error("Local-model smoke eval refuses to call a non-loopback MODEL_BASE_URL.");
    }

    const content = await llamaCppModelAdapter.complete(
      [
        {
          role: "system",
          content: "Return exactly one JSON object and no reasoning or markdown.",
        },
        {
          role: "user",
          content: 'Return {"ok":true}.',
        },
      ],
      {
        temperature: 0,
        maxOutputTokens: 128,
        response_format: { type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT },
        traceLabel: "evals.local_model_smoke",
      },
    );

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch {
      parsedJson = null;
    }
    const parsedResponse = LocalModelSmokeResponseSchema.safeParse(parsedJson);

    return {
      assertions: [
        expectTrue("model returns nonempty content", content.trim().length > 0),
        expectTrue("model returns valid JSON", parsedJson !== null),
        expectEqual("model follows the structured response contract", parsedResponse.success, true),
      ],
      metadata: {
        baseUrl: config.baseUrl,
        model: config.model,
        outputChars: content.length,
      },
    };
  },
};

export const localModelSmokeEvalSuite: EvalSuite = {
  id: LOCAL_MODEL_SMOKE_EVAL_SUITE_ID,
  name: "Local Model Compatibility Smoke",
  description: "Opt-in compatibility check for a configured loopback llama.cpp model.",
  cases: [localModelCase],
};
