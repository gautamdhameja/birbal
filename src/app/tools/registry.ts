import { ToolRegistry } from "../../framework/tools/registry.js";
import type { ToolDefinition } from "../../framework/tools/types.js";
import type { ArxivSearch } from "../arxiv/types.js";
import type { HackerNewsSearch } from "../hackernews/types.js";
import type { SourceDomainSearch, WebSearchPort } from "../source-search/types.js";
import { createFetchUrlTextTool } from "./fetch-url-text.js";
import type { FetchUrlTextOperation } from "./fetch-url-text.js";
import { createGetTimeTool } from "./get-time.js";
import { createSearchArxivTool } from "./search-arxiv.js";
import { createSearchHackerNewsTool } from "./search-hackernews.js";
import { createSearchSourceDomainTool } from "./search-source-domain.js";
import { createSearchWebTool } from "./search-web.js";

export type ResearchToolOperations = {
  now: () => Date;
  searchArxiv: ArxivSearch;
  searchHackerNews: HackerNewsSearch;
  searchWeb: WebSearchPort;
  searchSourceDomain: SourceDomainSearch;
  fetchUrlText: FetchUrlTextOperation;
};

export function createResearchTools(operations: ResearchToolOperations): ToolDefinition[] {
  return [
    createGetTimeTool(operations.now),
    createSearchArxivTool(operations.searchArxiv),
    createSearchHackerNewsTool(operations.searchHackerNews),
    createSearchWebTool(operations.searchWeb),
    createSearchSourceDomainTool(operations.searchSourceDomain),
    createFetchUrlTextTool(operations.fetchUrlText),
  ];
}

export function createToolRegistry(tools: readonly ToolDefinition[]): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerMany(tools);
  return registry;
}
