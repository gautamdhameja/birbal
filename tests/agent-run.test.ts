import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { z } from "zod";

import { buildSystemPrompt, renderSystemPrompt } from "../src/app/agent/prompts.js";
import { createBirbalAgent } from "../src/app/agent/run.js";
import { SOURCE_REGISTRY } from "../src/app/constants/source-registry.js";
import { createToolRegistry } from "../src/app/tools/registry.js";
import type { ChatMessage, ToolDefinition } from "../src/framework/index.js";
import { createToolExecutor } from "../src/framework/tools/executor.js";

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

  it("renders a supplied prompt template and research context without filesystem access", () => {
    const prompt = renderSystemPrompt({
      template: "Injected research instructions.",
      toolsText: "name: injected_tool",
      research: {
        interests: ["runtime composition"],
        avoid: ["global state"],
        preferredDifficulty: "advanced",
        maxReadingListItems: 3,
      },
      sourceRegistry: {
        sources: [
          {
            id: "architecture",
            name: "Architecture Notes",
            domains: ["example.com"],
            sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
            enabled: true,
          },
        ],
      },
    });

    assert.match(prompt, /^Injected research instructions\./);
    assert.match(prompt, /Interests: runtime composition/);
    assert.match(prompt, /Avoid: global state/);
    assert.match(prompt, /Enabled curated sources: architecture \(Architecture Notes\)/);
    assert.match(prompt, /Available tools:\nname: injected_tool$/);
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

  it("runs a fake model through a fresh app registry and executor to a final answer", async () => {
    const argsSchema = z.strictObject({ value: z.string() });
    const resultSchema = z.strictObject({ value: z.string() });
    const testTool: ToolDefinition<typeof argsSchema, typeof resultSchema> = {
      name: "test_echo",
      description: "Echo a test value.",
      argsSchema,
      resultSchema,
      run: async ({ value }) => ({ value }),
    };
    const registry = createToolRegistry([testTool]);
    const toolRunner = createToolExecutor(registry);
    const seenMessages: ChatMessage[][] = [];
    const responses = [
      JSON.stringify({ type: "tool_call", tool: "test_echo", args: { value: "fresh" } }),
      JSON.stringify({ type: "final", answer: "fresh runtime answer" }),
    ];
    const runAgent = createBirbalAgent({
      modelClient: {
        complete: async (messages) => {
          seenMessages.push([...messages]);
          return responses.shift() ?? JSON.stringify({ type: "final", answer: "unexpected" });
        },
      },
      toolRunner,
      buildSystemPrompt: (tools) => `Research tools:\n${tools}`,
      renderToolsForPrompt: () => registry.renderForPrompt(),
    });

    assert.equal(await runAgent("test the runtime"), "fresh runtime answer");
    assert.match(seenMessages[0]?.[0]?.content ?? "", /name: test_echo/);
    assert.deepEqual(JSON.parse(seenMessages[1]?.at(-1)?.content ?? "{}"), {
      type: "tool_result",
      tool: "test_echo",
      result: { value: "fresh" },
    });
  });

  it("rejects invalid maxSteps before calling the model", async () => {
    const runAgent = createBirbalAgent({
      modelClient: {
        complete: async () => JSON.stringify({ type: "final", answer: "unexpected" }),
      },
      toolRunner: async () => ({}),
      buildSystemPrompt: () => "system",
      renderToolsForPrompt: () => "",
    });

    await assert.rejects(runAgent("hello", { maxSteps: 0 }), /Too small: expected number to be >0/);
  });
});
