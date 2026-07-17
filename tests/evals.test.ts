// Purpose: Tests Birbal eval suite execution and reporting.
// Scope: Covers deterministic eval runner behavior through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OPENINFERENCE, OpenInferenceTraceRecorder } from "../src/framework/evals/openInference.js";
import { runEvalSuites } from "../src/framework/evals/runner.js";
import type { EvalSuite } from "../src/framework/evals/types.js";
import { runBirbalEvals, renderBirbalEvalResult } from "../src/app/evals/run.js";
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

describe("Birbal evals", () => {
  it("runs all deterministic eval suites", async () => {
    const result = await runBirbalEvals();

    assert.equal(result.status, "passed");
    assert.deepEqual(
      result.suites.map((suite) => suite.id),
      ["agent_harness", "use_case_extraction"],
    );
    assert.equal(result.counts.suites, 2);
    assert.equal(result.counts.cases, 4);
    assert.equal(result.counts.failed, 0);
    assert.ok(result.counts.assertions >= 10);
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
