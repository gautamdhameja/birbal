// Purpose: Tests agent run behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSystemPrompt } from "../src/app/agent/prompts.js";
import { runAgent } from "../src/app/agent/run.js";

describe("runAgent", () => {
  it("loads the research reading-list contract and runtime preferences", () => {
    const prompt = buildSystemPrompt("example_tool");

    assert.match(prompt, /^You are Birbal, a research agent\./);
    assert.match(prompt, /Return a concise reading list/);
    assert.match(prompt, /LLM agents/);
    assert.match(prompt, /Avoid:.*press release/);
    assert.doesNotMatch(prompt, /newsletter/i);
    assert.match(prompt, /Available tools:\nexample_tool$/);
  });

  it("rejects invalid maxSteps before calling the model", async () => {
    await assert.rejects(runAgent("hello", { maxSteps: 0 }), /Too small: expected number to be >0/);
  });
});
