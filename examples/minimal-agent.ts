// Purpose: Demonstrates minimal agent usage for framework adopters.
// Scope: Keeps the example small enough to copy and adapt.

import { z } from "zod";

import {
  createAgentHarness,
  createToolExecutor,
  parseJsonAgentResponse,
  ToolRegistry,
} from "../src/framework/index.js";
import type { ModelClient, ToolDefinition } from "../src/framework/index.js";

const argsSchema = z.strictObject({
  name: z.string(),
});
const resultSchema = z.strictObject({
  greeting: z.string(),
});

const greetTool: ToolDefinition<typeof argsSchema, typeof resultSchema> = {
  name: "greet",
  description: "Create a short greeting for a person.",
  argsSchema,
  resultSchema,
  run: async (args) => ({
    greeting: `Hello, ${args.name}.`,
  }),
};

const tools = new ToolRegistry();
tools.register(greetTool);

let modelCallCount = 0;
const deterministicModel: ModelClient = {
  complete: async () => {
    modelCallCount += 1;

    if (modelCallCount === 1) {
      return JSON.stringify({
        type: "tool_call",
        tool: "greet",
        args: {
          name: "Birbal",
        },
      });
    }

    return JSON.stringify({
      type: "final",
      answer: "Hello, Birbal.",
    });
  },
};

const runAgent = createAgentHarness({
  modelClient: deterministicModel,
  toolRunner: createToolExecutor(tools),
  buildSystemPrompt: (renderedTools) =>
    [
      "You are a minimal JSON agent.",
      "Use tools when useful.",
      "Return only final/tool_call/clarify JSON.",
      "",
      renderedTools,
    ].join("\n"),
  renderToolsForPrompt: () => tools.renderForPrompt(),
  parseResponse: parseJsonAgentResponse,
  defaultMaxSteps: 3,
});

console.log(await runAgent("Greet the project."));
