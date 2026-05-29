// Purpose: Implements the Birbal agent loop: run.
// Scope: Bridges the application CLI to the generic harness pieces.

import { z } from "zod";

import { AGENT } from "../constants/agent.js";
import { createAgentHarness } from "../framework/agent/harnessOrchestrator.js";
import { logger } from "../logging/logger.js";
import { llamaCppModelAdapter } from "../llama/adapter.js";
import { renderToolsForPrompt } from "../tools/registry.js";
import { runTool } from "../tools/executor.js";
import { parseAgentResponse } from "./parse-response.js";
import { buildSystemPrompt } from "./prompts.js";

const RunAgentOptionsSchema = z.strictObject({
  maxSteps: z.number().int().positive().optional(),
});

type RunAgentOptions = z.infer<typeof RunAgentOptionsSchema>;

const runBirbalAgent = createAgentHarness({
  modelClient: llamaCppModelAdapter,
  toolRunner: runTool,
  buildSystemPrompt,
  renderToolsForPrompt,
  parseResponse: parseAgentResponse,
  logger,
  defaultMaxSteps: AGENT.DEFAULT_MAX_STEPS,
  modelOptions: {
    max_tokens: AGENT.MODEL_MAX_TOKENS,
  },
});

export async function runAgent(task: string, options: RunAgentOptions = {}): Promise<string> {
  return runBirbalAgent(task, RunAgentOptionsSchema.parse(options));
}
