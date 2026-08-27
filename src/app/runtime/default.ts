import { createBirbalAgent } from "../agent/run.js";
import { createSystemPromptBuilder } from "../agent/prompts.js";
import { createAppLogger } from "../logging/logger.js";
import { getDefaultModelClient } from "../model-providers/default.js";
import { createAppToolExecutor } from "../tools/executor.js";
import { createToolRegistry } from "../tools/registry.js";
import type { BirbalRuntime } from "./types.js";

export function createDefaultRuntime(): BirbalRuntime {
  const logger = createAppLogger();
  const registry = createToolRegistry();
  const renderToolsForPrompt = () => registry.renderForPrompt();
  const runAgent = createBirbalAgent({
    modelClient: getDefaultModelClient(),
    toolRunner: createAppToolExecutor(registry, { logger }),
    buildSystemPrompt: createSystemPromptBuilder(),
    renderToolsForPrompt,
    logger,
  });

  return {
    runAgent,
    renderToolsForPrompt,
  };
}
