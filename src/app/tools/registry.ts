import { ToolRegistry } from "../../framework/tools/registry.js";
import type { ToolDefinition } from "../../framework/tools/types.js";
import { fetchUrlTextTool } from "./fetch-url-text.js";
import { getTimeTool } from "./get-time.js";
import { searchArxivTool } from "./search-arxiv.js";
import { searchHackerNewsTool } from "./search-hackernews.js";
import { searchSourceDomainTool } from "./search-source-domain.js";
import { searchWebTool } from "./search-web.js";

const DEFAULT_TOOLS = [
  getTimeTool,
  searchArxivTool,
  searchHackerNewsTool,
  searchWebTool,
  searchSourceDomainTool,
  fetchUrlTextTool,
] satisfies ToolDefinition[];

export function createToolRegistry(tools: readonly ToolDefinition[] = DEFAULT_TOOLS): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerMany(tools);
  return registry;
}
