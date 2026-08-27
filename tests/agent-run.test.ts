// Purpose: Tests agent run behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { buildSystemPrompt } from "../src/app/agent/prompts.js";
import { runAgent } from "../src/app/agent/run.js";
import { SOURCE_REGISTRY } from "../src/app/constants/source-registry.js";

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

  it("renders truthful fallback context for empty configured lists", () => {
    const prompt = buildSystemPrompt("", {
      loadResearchConfig: () => ({
        interests: ["agent evaluation"],
        avoid: [],
        preferredDifficulty: "advanced",
        maxReadingListItems: 5,
      }),
      loadSourceRegistry: () => ({
        sources: [
          {
            id: "disabled",
            name: "Disabled source",
            domains: ["example.com"],
            sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
            enabled: false,
          },
        ],
      }),
    });

    assert.match(prompt, /Avoid: none/);
    assert.match(prompt, /Enabled curated sources: none/);
  });

  it("loads bundled configuration outside the repository working directory", () => {
    const originalCwd = process.cwd();
    process.chdir(mkdtempSync(join(tmpdir(), "birbal-cwd-")));

    try {
      assert.match(buildSystemPrompt("example_tool"), /Available tools:\nexample_tool$/);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("rejects invalid maxSteps before calling the model", async () => {
    await assert.rejects(runAgent("hello", { maxSteps: 0 }), /Too small: expected number to be >0/);
  });
});
