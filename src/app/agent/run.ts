import { FRAMEWORK_AGENT as AGENT } from "../../framework/agent/constants.js";
import type { AgentRunOptions } from "../../framework/agent/types.js";
import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import { createAgentHarness } from "../../framework/agent/harnessOrchestrator.js";
import { logger } from "../logging/logger.js";
import { getDefaultModelClient } from "../model-providers/default.js";
import { toolRegistry } from "../tools/registry.js";
import { runTool } from "../tools/executor.js";
import { parseAgentResponse } from "./parse-response.js";
import { buildSystemPrompt } from "./prompts.js";

const runBirbalAgent = createAgentHarness({
  modelClient: getDefaultModelClient(),
  toolRunner: runTool,
  buildSystemPrompt,
  renderToolsForPrompt: () => toolRegistry.renderForPrompt(),
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

export async function runAgent(task: string, options: AgentRunOptions = {}): Promise<string> {
  return runBirbalAgent(task, options);
}
