import { FRAMEWORK_AGENT as AGENT } from "../../framework/agent/constants.js";
import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import { createAgentHarness } from "../../framework/agent/harnessOrchestrator.js";
import { parseAgentResponse } from "./parse-response.js";
import type { BirbalAgentDependencies } from "./types.js";

export function createBirbalAgent(dependencies: BirbalAgentDependencies) {
  return createAgentHarness({
    modelClient: dependencies.modelClient,
    toolRunner: dependencies.toolRunner,
    buildSystemPrompt: dependencies.buildSystemPrompt,
    renderToolsForPrompt: dependencies.renderToolsForPrompt,
    parseResponse: parseAgentResponse,
    logger: dependencies.logger,
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
}
