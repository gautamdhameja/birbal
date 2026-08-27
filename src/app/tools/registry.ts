import { ToolRegistry } from "../../framework/tools/registry.js";
import type { ToolDefinition } from "../../framework/tools/types.js";
import { createFetchUrlTextTool } from "./fetch-url-text.js";
import { createGetTimeTool } from "./get-time.js";
import { createSearchArxivTool } from "./search-arxiv.js";
import { createSearchHackerNewsTool } from "./search-hackernews.js";
import { createSearchSourceDomainTool } from "./search-source-domain.js";
import { createSearchWebTool } from "./search-web.js";
import type { ResearchToolOperations } from "./types.js";

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
