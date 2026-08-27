import { createBirbalAgent } from "../agent/run.js";
import { createSystemPromptBuilder } from "../agent/prompts.js";
import { createArxivClient } from "../arxiv/client.js";
import { createBraveSearchClient } from "../brave-search/client.js";
import { createHackerNewsClient } from "../hackernews/client.js";
import { createAppLogger } from "../logging/logger.js";
import { getDefaultModelClient } from "../model-providers/default.js";
import { createSourceDomainSearch } from "../source-search/domain.js";
import { createAppToolExecutor } from "../tools/executor.js";
import { createResearchTools, createToolRegistry } from "../tools/registry.js";
import { fetchUrlText } from "../url-text/client.js";
import type { ToolRegistry } from "../../framework/tools/registry.js";
import type { BirbalRuntime } from "./types.js";

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

export function createDefaultRuntime(): BirbalRuntime {
  const logger = createAppLogger();
  const registry = createDefaultToolRegistry();
  const renderToolsForPrompt = () => registry.renderForPrompt();
  const runAgent = createBirbalAgent({
    modelClient: getDefaultModelClient({ logger }),
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
