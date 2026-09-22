import { FRAMEWORK_AGENT as AGENT } from "../../framework/agent/constants.js";
import { createAgentHarness } from "../../framework/agent/harnessOrchestrator.js";
import { FrameworkAgentResponseSchema } from "../../framework/agent/protocol.js";
import { createStructuredModelCompletionOptions } from "../model-providers/response-format.js";
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
    modelOptions: createStructuredModelCompletionOptions({
      name: "agent_response",
      schema: dependencies.responseSchema ?? FrameworkAgentResponseSchema,
    }),
  });
}
