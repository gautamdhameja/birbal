import { ToolRegistry } from "../../framework/tools/registry.js";
import type { ToolDefinition } from "../../framework/tools/types.js";
import { fetchUrlText } from "../url-text/client.js";
import { searchArxiv } from "../arxiv/client.js";
import { searchHackerNews } from "../hackernews/client.js";
import { searchSourceDomain } from "../source-search/domain.js";
import { searchWeb } from "../brave-search/client.js";
import { createFetchUrlTextTool } from "./fetch-url-text.js";
import { createGetTimeTool } from "./get-time.js";
import { createSearchArxivTool } from "./search-arxiv.js";
import { createSearchHackerNewsTool } from "./search-hackernews.js";
import { createSearchSourceDomainTool } from "./search-source-domain.js";
import { createSearchWebTool } from "./search-web.js";

export type ResearchToolOperations = {
  now: () => Date;
  searchArxiv: typeof searchArxiv;
  searchHackerNews: typeof searchHackerNews;
  searchWeb: typeof searchWeb;
  searchSourceDomain: typeof searchSourceDomain;
  fetchUrlText: typeof fetchUrlText;
};

const DEFAULT_OPERATIONS: ResearchToolOperations = {
  now: () => new Date(),
  searchArxiv,
  searchHackerNews,
  searchWeb,
  searchSourceDomain,
  fetchUrlText,
};

export function createResearchTools(
  operations: ResearchToolOperations = DEFAULT_OPERATIONS,
): ToolDefinition[] {
  return [
    createGetTimeTool(operations.now),
    createSearchArxivTool(operations.searchArxiv),
    createSearchHackerNewsTool(operations.searchHackerNews),
    createSearchWebTool(operations.searchWeb),
    createSearchSourceDomainTool(operations.searchSourceDomain),
    createFetchUrlTextTool(operations.fetchUrlText),
  ];
}

export function createToolRegistry(
  tools: readonly ToolDefinition[] = createResearchTools(),
): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerMany(tools);
  return registry;
}
