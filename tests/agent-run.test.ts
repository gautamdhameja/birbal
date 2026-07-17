// Purpose: Tests agent run behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSystemPrompt } from "../src/app/agent/prompts.js";
import { runAgent } from "../src/app/agent/run.js";

describe("runAgent", () => {
  it("loads the application system prompt from the repository prompt directory", () => {
    const prompt = buildSystemPrompt("example_tool");

    assert.match(prompt, /^You are controlled by a TypeScript agent harness\./);
    assert.match(prompt, /Available tools:\nexample_tool$/);
  });

  it("rejects invalid maxSteps before calling the model", async () => {
    await assert.rejects(runAgent("hello", { maxSteps: 0 }), /Too small: expected number to be >0/);
  });
});
