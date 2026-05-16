import { z } from "zod";

import { getTimeTool } from "./get-time.js";
import type { ToolDefinition, ToolError } from "./types.js";

const tools = [getTimeTool] satisfies ToolDefinition[];
const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

function renderArgsSchema(argsSchema: z.ZodType): string {
  const { $schema: _schema, ...jsonSchema } = z.toJSONSchema(argsSchema);
  return JSON.stringify(jsonSchema);
}

export function listTools(): ToolDefinition[] {
  return [...tools];
}

export function renderToolsForPrompt(): string {
  return tools
    .map((tool) =>
      [
        `name: ${tool.name}`,
        `description: ${tool.description}`,
        `args: ${renderArgsSchema(tool.argsSchema)}`,
      ].join("\n"),
    )
    .join("\n\n");
}

export async function runTool(name: string, args: unknown): Promise<unknown | ToolError> {
  const tool = toolsByName.get(name);
  if (!tool) {
    return { error: `Unknown tool: ${name}` };
  }

  const parsedArgs = tool.argsSchema.safeParse(args);
  if (!parsedArgs.success) {
    return { error: `Invalid args for tool "${name}": ${z.prettifyError(parsedArgs.error)}` };
  }

  try {
    return await tool.run(parsedArgs.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
