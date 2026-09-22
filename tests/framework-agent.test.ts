import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import {
  createFrameworkAgentResponseSchema,
  createAgentHarness,
  createToolExecutor,
  parseJsonAgentResponse,
  ToolRegistry,
} from "../src/framework/index.js";
import type { AgentLifecycleHooks, ChatMessage, ToolDefinition } from "../src/framework/index.js";

describe("framework agent harness", () => {
  it("builds the structured response contract from registered tool argument schemas", () => {
    const argsSchema = z.strictObject({ value: z.string() });
    const resultSchema = z.strictObject({ value: z.string() });
    const tool: ToolDefinition<typeof argsSchema, typeof resultSchema> = {
      name: "echo",
      description: "Echo a value.",
      argsSchema,
      resultSchema,
      run: async (args) => args,
    };
    const schema = createFrameworkAgentResponseSchema([tool]);

    assert.deepEqual(
      schema.parse({ type: "tool_call", tool: "echo", args: { value: "framework" } }),
      { type: "tool_call", tool: "echo", args: { value: "framework" } },
    );
    assert.throws(
      () => schema.parse({ type: "tool_call", tool: "echo", args: { other: "value" } }),
      /value/,
    );
    assert.deepEqual(schema.parse({ type: "final", answer: "done" }), {
      type: "final",
      answer: "done",
    });
  });

  it("runs a model-tool-model loop without Birbal-specific components", async () => {
    const registry = new ToolRegistry();
    const argsSchema = z.strictObject({
      value: z.string(),
    });
    const resultSchema = z.strictObject({
      value: z.string(),
    });

    const echoTool: ToolDefinition<typeof argsSchema, typeof resultSchema> = {
      name: "echo",
      description: "Echo a value.",
      argsSchema,
      resultSchema,
      run: async (args) => ({ value: args.value }),
    };
    registry.register(echoTool);

    const seenMessages: ChatMessage[][] = [];
    const runHarness = createAgentHarness({
      modelClient: {
        complete: async (messages) => {
          seenMessages.push([...messages]);
          if (seenMessages.length === 1) {
            return JSON.stringify({
              type: "tool_call",
              tool: "echo",
              args: {
                value: "framework",
              },
            });
          }

          return JSON.stringify({
            type: "final",
            answer: "framework",
          });
        },
      },
      toolRunner: createToolExecutor(registry),
      buildSystemPrompt: (tools) => `Tools:\n${tools}`,
      renderToolsForPrompt: () => registry.renderForPrompt(),
      parseResponse: parseJsonAgentResponse,
      defaultMaxSteps: 3,
    });

    const answer = await runHarness("use echo");

    assert.equal(answer, "framework");
    assert.equal(seenMessages.length, 2);
    assert.match(seenMessages[0]?.[0]?.content ?? "", /name: echo/);
    assert.deepEqual(JSON.parse(seenMessages[1]?.at(-1)?.content ?? "{}"), {
      type: "tool_result",
      tool: "echo",
      result: {
        value: "framework",
      },
    });
  });

  it("returns a clear max-step result", async () => {
    const runHarness = createAgentHarness({
      modelClient: {
        complete: async () =>
          JSON.stringify({
            type: "tool_call",
            tool: "missing",
            args: {},
          }),
      },
      toolRunner: async () => ({ error: "missing" }),
      buildSystemPrompt: () => "system",
      renderToolsForPrompt: () => "",
      parseResponse: (raw) =>
        z
          .strictObject({
            type: z.literal("tool_call"),
            tool: z.string(),
            args: z.unknown(),
          })
          .parse(JSON.parse(raw)),
      defaultMaxSteps: 1,
    });

    assert.equal(
      await runHarness("loop"),
      "Agent stopped after reaching the maximum step limit of 1.",
    );
  });

  it("skips debug logging when the logger disables that level", async () => {
    const runHarness = createAgentHarness({
      modelClient: {
        complete: async () => JSON.stringify({ type: "final", answer: "done" }),
      },
      toolRunner: async () => ({}),
      buildSystemPrompt: () => "system",
      renderToolsForPrompt: () => "",
      parseResponse: parseJsonAgentResponse,
      logger: {
        debug: () => assert.fail("debug logging should be disabled"),
        isLevelEnabled: () => false,
      },
      defaultMaxSteps: 1,
    });

    assert.equal(await runHarness("finish"), "done");
  });

  it("honors debug-level changes during a run", async () => {
    let debugEnabled = false;
    const events: unknown[] = [];
    const runHarness = createAgentHarness({
      modelClient: {
        complete: async () => JSON.stringify({ type: "final", answer: "done" }),
      },
      toolRunner: async () => ({}),
      buildSystemPrompt: () => "system",
      renderToolsForPrompt: () => "",
      parseResponse: parseJsonAgentResponse,
      logger: {
        debug: (payload) => events.push(payload.event),
        isLevelEnabled: () => debugEnabled,
      },
      hooks: {
        beforeModelCall: () => {
          debugEnabled = true;
        },
      },
      defaultMaxSteps: 1,
    });

    assert.equal(await runHarness("finish"), "done");
    assert.deepEqual(events, [
      "handoff.model_to_harness",
      "agent.response.parsed",
      "agent.run.final",
    ]);
  });

  it("repairs one invalid protocol response before continuing the agent loop", async () => {
    const responses = [
      '{"type":"tool_call","tool":"echo","args":{"value":"framework"}}\n{"type":"final","answer":"bad"}',
      JSON.stringify({
        type: "tool_call",
        tool: "echo",
        args: {
          value: "framework",
        },
      }),
      JSON.stringify({
        type: "final",
        answer: "framework",
      }),
    ];
    const seenMessages: ChatMessage[][] = [];

    const runHarness = createAgentHarness({
      modelClient: {
        complete: async (messages) => {
          seenMessages.push([...messages]);
          return responses.shift() ?? "";
        },
      },
      toolRunner: async (_tool, args) => args,
      buildSystemPrompt: () => "system",
      renderToolsForPrompt: () => "",
      parseResponse: parseJsonAgentResponse,
      defaultMaxSteps: 4,
      maxParseRepairAttempts: 1,
    });

    assert.equal(await runHarness("use echo"), "framework");
    assert.equal(seenMessages.length, 3);
    assert.match(seenMessages[1]?.at(-1)?.content ?? "", /previous response was invalid/);
    assert.match(seenMessages[1]?.at(-1)?.content ?? "", /exactly one valid JSON object/);
    assert.doesNotMatch(seenMessages[1]?.at(-1)?.content ?? "", /clarify/i);
  });

  it("uses the configured user role for protocol repair messages", async () => {
    const seenMessages: ChatMessage[][] = [];
    const responses = ["not json", JSON.stringify({ type: "final", answer: "fixed" })];
    const runHarness = createAgentHarness({
      modelClient: {
        complete: async (messages) => {
          seenMessages.push([...messages]);
          return responses.shift() ?? "";
        },
      },
      toolRunner: async () => ({}),
      buildSystemPrompt: () => "system",
      renderToolsForPrompt: () => "",
      parseResponse: parseJsonAgentResponse,
      defaultMaxSteps: 2,
      maxParseRepairAttempts: 1,
      roles: {
        system: "user",
        user: "system",
        assistant: "assistant",
      },
    });

    assert.equal(await runHarness("repair"), "fixed");
    assert.equal(seenMessages[1]?.at(-1)?.role, "system");
  });

  it("emits lifecycle hooks around model and tool handoffs", async () => {
    const events: string[] = [];
    const hooks: AgentLifecycleHooks = {
      beforeModelCall: () => {
        events.push("before_model");
      },
      afterModelCall: () => {
        events.push("after_model");
      },
      onResponseParsed: () => {
        events.push("parsed");
      },
      beforeToolCall: () => {
        events.push("before_tool");
      },
      afterToolCall: () => {
        events.push("after_tool");
      },
      onMaxSteps: () => {
        events.push("max_steps");
      },
    };
    const runHarness = createAgentHarness({
      modelClient: {
        complete: async () =>
          JSON.stringify({
            type: "tool_call",
            tool: "noop",
            args: {},
          }),
      },
      toolRunner: async () => ({ ok: true }),
      buildSystemPrompt: () => "system",
      renderToolsForPrompt: () => "",
      parseResponse: (raw) =>
        z
          .strictObject({
            type: z.literal("tool_call"),
            tool: z.string(),
            args: z.unknown(),
          })
          .parse(JSON.parse(raw)),
      defaultMaxSteps: 1,
      hooks,
    });

    await runHarness("trace hooks");

    assert.deepEqual(events, [
      "before_model",
      "after_model",
      "parsed",
      "before_tool",
      "after_tool",
      "max_steps",
    ]);
  });
});
