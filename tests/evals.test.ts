// Purpose: Tests Birbal eval suite execution and reporting.
// Scope: Covers deterministic eval runner behavior through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OPENINFERENCE, OpenInferenceTraceRecorder } from "../src/framework/evals/openInference.js";
import { runEvalSuites } from "../src/framework/evals/runner.js";
import type { EvalSuite } from "../src/framework/evals/types.js";
import { runBirbalEvals, renderBirbalEvalResult } from "../src/app/evals/run.js";
import { LOCAL_MODEL_SMOKE_EVAL_SUITE_ID } from "../src/app/evals/constants.js";
import { TOOLS } from "../src/app/constants/tools.js";

function evalSuite(id: string, delayMs = 0): EvalSuite {
  return {
    id,
    name: id,
    cases: [
      {
        id: `${id}_case`,
        name: `${id} case`,
        async run() {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return {
            assertions: [
              {
                name: `${id} passed`,
                passed: true,
              },
            ],
          };
        },
      },
    ],
  };
}

const MODEL_ENV_NAMES = ["MODEL_PROVIDER", "MODEL_BASE_URL", "MODEL_NAME"] as const;

async function withModelEnvironment(
  values: Partial<Record<(typeof MODEL_ENV_NAMES)[number], string>>,
  fetchImplementation: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  const originalEnv = Object.fromEntries(MODEL_ENV_NAMES.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;

  for (const name of MODEL_ENV_NAMES) {
    const value = values[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  globalThis.fetch = fetchImplementation;

  try {
    await run();
  } finally {
    for (const name of MODEL_ENV_NAMES) {
      const value = originalEnv[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    globalThis.fetch = originalFetch;
  }
}

describe("Birbal evals", () => {
  it("runs all deterministic eval suites", async () => {
    const result = await runBirbalEvals();

    assert.equal(result.status, "passed");
    assert.deepEqual(
      result.suites.map((suite) => suite.id),
      ["agent_harness", "use_case_extraction", "use_case_verification", "use_case_pipeline_replay"],
    );
    assert.equal(result.counts.suites, 4);
    assert.equal(result.counts.failed, 0);
  });

  it("filters eval suites by ID", async () => {
    const result = await runBirbalEvals({ suiteIds: ["agent_harness"] });

    assert.equal(result.status, "passed");
    assert.deepEqual(
      result.suites.map((suite) => suite.id),
      ["agent_harness"],
    );
    assert.equal(result.counts.cases, 2);
  });

  it("rejects unknown eval suite IDs", async () => {
    await assert.rejects(
      runBirbalEvals({ suiteIds: ["missing_suite"] }),
      /Unknown eval suite\(s\): missing_suite/,
    );
  });

  it("refuses the local-model suite before fetching when a hosted provider is configured", async () => {
    let fetchCalls = 0;
    await withModelEnvironment(
      { MODEL_PROVIDER: "openai" },
      async () => {
        fetchCalls += 1;
        throw new Error("unexpected fetch");
      },
      async () => {
        const result = await runBirbalEvals({ suiteIds: [LOCAL_MODEL_SMOKE_EVAL_SUITE_ID] });

        assert.equal(result.status, "failed");
        assert.match(result.suites[0]?.cases[0]?.error ?? "", /requires MODEL_PROVIDER=llama_cpp/);
        assert.equal(fetchCalls, 0);
      },
    );
  });

  it("runs the opt-in smoke suite against a loopback llama.cpp response", async () => {
    let requestBody: Record<string, unknown> | undefined;
    await withModelEnvironment(
      {
        MODEL_PROVIDER: "llama_cpp",
        MODEL_BASE_URL: "http://127.0.0.1:8080",
        MODEL_NAME: "local-test-model",
      },
      (async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
          { status: 200 },
        );
      }) as typeof fetch,
      async () => {
        const result = await runBirbalEvals({ suiteIds: [LOCAL_MODEL_SMOKE_EVAL_SUITE_ID] });

        assert.equal(result.status, "passed");
        assert.deepEqual(
          result.suites.map((suite) => suite.id),
          [LOCAL_MODEL_SMOKE_EVAL_SUITE_ID],
        );
        assert.equal(requestBody?.temperature, 0);
        assert.equal(requestBody?.max_tokens, 128);
        assert.deepEqual(requestBody?.response_format, { type: "json_object" });
      },
    );
  });

  it("refuses a non-loopback local-model URL before fetching", async () => {
    let fetchCalls = 0;
    await withModelEnvironment(
      {
        MODEL_PROVIDER: "llama_cpp",
        MODEL_BASE_URL: "https://models.example.com",
        MODEL_NAME: "remote-model",
      },
      async () => {
        fetchCalls += 1;
        throw new Error("unexpected fetch");
      },
      async () => {
        const result = await runBirbalEvals({ suiteIds: [LOCAL_MODEL_SMOKE_EVAL_SUITE_ID] });

        assert.equal(result.status, "failed");
        assert.match(result.suites[0]?.cases[0]?.error ?? "", /refuses.*non-loopback/u);
        assert.equal(fetchCalls, 0);
      },
    );
  });

  it("diagnoses local-model reasoning that exhausts the answer budget", async () => {
    await withModelEnvironment(
      {
        MODEL_PROVIDER: "llama_cpp",
        MODEL_BASE_URL: "http://127.0.0.1:8080",
        MODEL_NAME: "reasoning-model",
      },
      (async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: "", reasoning_content: "Still reasoning" },
                finish_reason: "length",
              },
            ],
            usage: { completion_tokens: 10 },
          }),
          { status: 200 },
        )) as typeof fetch,
      async () => {
        const result = await runBirbalEvals({ suiteIds: [LOCAL_MODEL_SMOKE_EVAL_SUITE_ID] });
        const assertion = result.suites[0]?.cases[0]?.assertions.find(
          ({ name }) => name === "model preserves output budget for answer content",
        );

        assert.equal(result.status, "failed");
        assert.equal(assertion?.passed, false);
        assert.match(assertion?.message ?? "", /reasoning exhausted the 128-token output budget/u);
      },
    );
  });

  it("does not misclassify bounded reasoning as budget exhaustion", async () => {
    await withModelEnvironment(
      {
        MODEL_PROVIDER: "llama_cpp",
        MODEL_BASE_URL: "http://127.0.0.1:8080",
        MODEL_NAME: "reasoning-model",
      },
      (async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: "", reasoning_content: "Brief reasoning" },
                finish_reason: "stop",
              },
            ],
            usage: { completion_tokens: 10 },
          }),
          { status: 200 },
        )) as typeof fetch,
      async () => {
        const result = await runBirbalEvals({ suiteIds: [LOCAL_MODEL_SMOKE_EVAL_SUITE_ID] });
        const assertion = result.suites[0]?.cases[0]?.assertions.find(
          ({ name }) => name === "model preserves output budget for answer content",
        );

        assert.equal(result.status, "failed");
        assert.equal(assertion?.passed, true);
      },
    );
  });

  it("detects token-budget exhaustion without a length finish reason", async () => {
    await withModelEnvironment(
      {
        MODEL_PROVIDER: "llama_cpp",
        MODEL_BASE_URL: "http://127.0.0.1:8080",
        MODEL_NAME: "reasoning-model",
      },
      (async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: "", reasoning_content: "Reasoning consumed the budget" },
                finish_reason: "stop",
              },
            ],
            usage: { completion_tokens: 128 },
          }),
          { status: 200 },
        )) as typeof fetch,
      async () => {
        const result = await runBirbalEvals({ suiteIds: [LOCAL_MODEL_SMOKE_EVAL_SUITE_ID] });
        const assertion = result.suites[0]?.cases[0]?.assertions.find(
          ({ name }) => name === "model preserves output budget for answer content",
        );

        assert.equal(result.status, "failed");
        assert.equal(assertion?.passed, false);
        assert.match(assertion?.message ?? "", /reasoning exhausted/u);
      },
    );
  });

  it("keeps strict JSON and sentinel failures distinct", async () => {
    const cases = [
      { content: "not json", failedAssertion: "model returns valid JSON" },
      {
        content: '{"ok":true,"extra":1}',
        failedAssertion: "model follows the structured response contract",
      },
      {
        content: '{"ok":false}',
        failedAssertion: "model follows the structured response contract",
      },
    ];

    for (const testCase of cases) {
      await withModelEnvironment(
        {
          MODEL_PROVIDER: "llama_cpp",
          MODEL_BASE_URL: "http://127.0.0.1:8080",
          MODEL_NAME: "local-test-model",
        },
        (async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: testCase.content } }] }), {
            status: 200,
          })) as typeof fetch,
        async () => {
          const result = await runBirbalEvals({ suiteIds: [LOCAL_MODEL_SMOKE_EVAL_SUITE_ID] });
          const assertion = result.suites[0]?.cases[0]?.assertions.find(
            ({ name }) => name === testCase.failedAssertion,
          );

          assert.equal(result.status, "failed");
          assert.equal(assertion?.passed, false);
        },
      );
    }
  });

  it("rejects unknown suite IDs in the generic runner", async () => {
    await assert.rejects(
      runEvalSuites([evalSuite("known")], { suiteIds: ["missing"] }),
      /Unknown eval suite\(s\): missing/,
    );
  });

  it("returns filtered generic suites in requested order", async () => {
    const result = await runEvalSuites([evalSuite("first", 4), evalSuite("second", 1)], {
      concurrency: 2,
      suiteIds: ["second", "first"],
    });

    assert.deepEqual(
      result.suites.map((suite) => suite.id),
      ["second", "first"],
    );
  });

  it("records OpenInference-style spans for agent evals", async () => {
    const result = await runBirbalEvals({ suiteIds: ["agent_harness"] });
    const spans = result.suites.flatMap((suite) =>
      suite.cases.flatMap((evalCase) => evalCase.trace?.spans ?? []),
    );
    const spanKinds = spans.map((span) => span.attributes[OPENINFERENCE.ATTRIBUTES.SPAN_KIND]);

    assert.ok(spanKinds.includes(OPENINFERENCE.SPAN_KIND.LLM));
    assert.ok(spanKinds.includes(OPENINFERENCE.SPAN_KIND.TOOL));
    assert.ok(
      spans.some(
        (span) =>
          span.name === `tool.${TOOLS.GET_TIME.NAME}` &&
          span.attributes[OPENINFERENCE.ATTRIBUTES.TOOL_NAME] === TOOLS.GET_TIME.NAME,
      ),
    );
  });

  it("bounds OpenInference trace message payloads", () => {
    const recorder = new OpenInferenceTraceRecorder({
      idFactory: () => "id",
      maxAttributeChars: 8,
      maxMessages: 1,
      now: () => new Date("2026-07-11T09:00:00.000Z"),
    });

    assert.deepEqual(
      recorder.formatMessages([
        {
          role: "system",
          content: "first message",
        },
        {
          role: "user",
          content: "second message is long",
        },
      ]),
      [
        {
          role: "user",
          content: "second m...",
        },
      ],
    );
  });

  it("renders text and JSON reports", async () => {
    const result = await runBirbalEvals({ suiteIds: ["use_case_extraction"] });

    assert.match(renderBirbalEvalResult(result), /Eval status: passed/);
    assert.deepEqual(JSON.parse(renderBirbalEvalResult(result, { json: true })).status, "passed");
  });
});
