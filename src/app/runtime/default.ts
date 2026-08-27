import { createBirbalAgent } from "../agent/run.js";
import { createSystemPromptBuilder } from "../agent/prompts.js";
import {
  createArchitectureLabOperations,
  createArchitectureLabResearchRunner,
} from "../architecture-lab/operations.js";
import { createArchitectureLabSession } from "../architecture-lab/session.js";
import { createArxivClient } from "../arxiv/client.js";
import { createBraveSearchClient } from "../brave-search/client.js";
import { createHackerNewsClient } from "../hackernews/client.js";
import { createAppLogger } from "../logging/logger.js";
import { getDefaultModelClient } from "../model-providers/default.js";
import { createSourceDomainSearch } from "../source-search/domain.js";
import { createResearchTools, createToolRegistry } from "../tools/registry.js";
import { fetchUrlText } from "../url-text/client.js";
import { createToolExecutor } from "../../framework/tools/executor.js";
import type { ToolRegistry } from "../../framework/tools/registry.js";
import { LOGGING } from "../constants/runtime.js";
import type { BirbalRuntime, BirbalRuntimeOptions, DefaultRuntimeDependencies } from "./types.js";

export function createDefaultToolRegistry(): ToolRegistry {
  const braveSearchClient = createBraveSearchClient();
  const arxivClient = createArxivClient();
  const hackerNewsClient = createHackerNewsClient();
  const searchSourceDomain = createSourceDomainSearch({
    searchWeb: braveSearchClient.searchWeb,
  });
  return createToolRegistry(
    createResearchTools({
      now: () => new Date(),
      searchArxiv: arxivClient.searchArxiv,
      searchHackerNews: hackerNewsClient.searchHackerNews,
      searchWeb: braveSearchClient.searchWeb,
      searchSourceDomain,
      fetchUrlText,
    }),
  );
}

export function createDefaultRuntime(
  options: BirbalRuntimeOptions = {},
  dependencies: DefaultRuntimeDependencies = {},
): BirbalRuntime {
  const logger = (dependencies.createLogger ?? createAppLogger)(
    options.trace ? { level: LOGGING.DEBUG_LEVEL, pretty: true } : {},
  );
  const registry = createDefaultToolRegistry();
  const renderToolsForPrompt = () => registry.renderForPrompt();
  const modelClient = getDefaultModelClient({ logger });
  const toolRunner = createToolExecutor(registry, { logger });
  const runAgent = createBirbalAgent({
    modelClient,
    toolRunner,
    buildSystemPrompt: createSystemPromptBuilder(),
    renderToolsForPrompt,
    logger,
  });
  const labOperations = createArchitectureLabOperations({
    research: createArchitectureLabResearchRunner({
      modelClient,
      toolRunner,
      renderToolsForPrompt,
      logger,
    }),
    completeFn: modelClient.complete,
    logger,
  });

  return {
    runAgent,
    renderToolsForPrompt,
    createLabSession({ input, onOutput }) {
      return createArchitectureLabSession({ operations: labOperations, input, onOutput });
    },
  };
}
