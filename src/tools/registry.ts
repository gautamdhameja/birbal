import { z } from "zod";

import { TOOLS } from "../constants/tools.js";
import { getTimeTool } from "./get-time.js";
import { searchArxivTool } from "./search-arxiv.js";
import { searchHackerNewsTool } from "./search-hackernews.js";
import type { ToolDefinition } from "./types.js";

const tools = [getTimeTool, searchArxivTool, searchHackerNewsTool] satisfies ToolDefinition[];
const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

function renderArgsSchema(argsSchema: z.ZodType): string {
  const { $schema: _schema, ...jsonSchema } = z.toJSONSchema(argsSchema);
  const objectSchema = jsonSchema as {
    properties?: Record<string, { default?: unknown }>;
    required?: string[];
  };

  if (objectSchema.properties && objectSchema.required) {
    objectSchema.required = objectSchema.required.filter(
      (propertyName) => !("default" in (objectSchema.properties?.[propertyName] ?? {})),
    );
  }

  return JSON.stringify(jsonSchema);
}

export function listTools(): ToolDefinition[] {
  return [...tools];
}

export function getTool(name: string): ToolDefinition | undefined {
  return toolsByName.get(name);
}

export function renderToolsForPrompt(): string {
  return tools
    .map((tool) =>
      [
        `${TOOLS.PROMPT_LABELS.NAME}: ${tool.name}`,
        `${TOOLS.PROMPT_LABELS.DESCRIPTION}: ${tool.description}`,
        `${TOOLS.PROMPT_LABELS.ARGS}: ${renderArgsSchema(tool.argsSchema)}`,
      ].join("\n"),
    )
    .join("\n\n");
}
