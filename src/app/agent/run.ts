import { FRAMEWORK_AGENT as AGENT } from "../../framework/agent/constants.js";
import { createAgentHarness } from "../../framework/agent/harnessOrchestrator.js";
import { STRUCTURED_MODEL_COMPLETION_OPTIONS } from "../constants/model-completion.js";
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
    modelOptions: STRUCTURED_MODEL_COMPLETION_OPTIONS,
  });
}
