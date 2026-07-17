// Purpose: Implements the Birbal agent loop: run.
// Scope: Bridges the application CLI to the generic harness pieces.

import { z } from "zod";

import { AGENT } from "../constants/agent.js";
import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import { createAgentHarness } from "../../framework/agent/harnessOrchestrator.js";
import { logger } from "../logging/logger.js";
import { getDefaultModelClient } from "../model-providers/default.js";
import { renderToolsForPrompt } from "../tools/registry.js";
import { runTool } from "../tools/executor.js";
import { parseAgentResponse } from "./parse-response.js";
import { buildSystemPrompt } from "./prompts.js";

const RunAgentOptionsSchema = z.strictObject({
  maxSteps: z.number().int().positive().optional(),
});

type RunAgentOptions = z.infer<typeof RunAgentOptionsSchema>;

const runBirbalAgent = createAgentHarness({
  modelClient: getDefaultModelClient(),
  toolRunner: runTool,
  buildSystemPrompt,
  renderToolsForPrompt,
  parseResponse: parseAgentResponse,
  logger,
  defaultMaxSteps: AGENT.DEFAULT_MAX_STEPS,
  maxParseRepairAttempts: 1,
  modelOptions: {
    temperature: 0,
    maxOutputTokens: AGENT.MODEL_MAX_TOKENS,
    response_format: {
      type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT,
    },
  },
});

export async function runAgent(task: string, options: RunAgentOptions = {}): Promise<string> {
  return runBirbalAgent(task, RunAgentOptionsSchema.parse(options));
}
