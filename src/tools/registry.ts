import { z } from "zod";

import { logger } from "../logging/logger.js";
import { getTimeTool } from "./get-time.js";
import type { ToolDefinition, ToolError } from "./types.js";

const tools = [getTimeTool] satisfies ToolDefinition[];
const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

function renderArgsSchema(argsSchema: z.ZodType): string {
  const { $schema: _schema, ...jsonSchema } = z.toJSONSchema(argsSchema);
  return JSON.stringify(jsonSchema);
}

export type ToolRunTraceContext = {
  traceId?: string;
  modelPassId?: string;
  step?: number;
};

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

export async function runTool(
  name: string,
  args: unknown,
  traceContext: ToolRunTraceContext = {},
): Promise<unknown | ToolError> {
  const tool = toolsByName.get(name);
  if (!tool) {
    logger.debug(
      {
        ...traceContext,
        event: "tool.lookup.failed",
        tool: name,
      },
      "tool lookup failed",
    );
    return { error: `Unknown tool: ${name}` };
  }

  const parsedArgs = tool.argsSchema.safeParse(args);
  if (!parsedArgs.success) {
    logger.debug(
      {
        ...traceContext,
        event: "tool.args.invalid",
        tool: name,
        args,
        validationError: z.prettifyError(parsedArgs.error),
      },
      "tool argument validation failed",
    );
    return { error: `Invalid args for tool "${name}": ${z.prettifyError(parsedArgs.error)}` };
  }

  try {
    logger.debug(
      {
        ...traceContext,
        event: "tool.run.start",
        tool: name,
        args: parsedArgs.data,
      },
      "tool run started",
    );

    const result = await tool.run(parsedArgs.data);

    logger.debug(
      {
        ...traceContext,
        event: "tool.run.success",
        tool: name,
        result,
      },
      "tool run completed",
    );

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.debug(
      {
        ...traceContext,
        event: "tool.run.error",
        tool: name,
        error: message,
      },
      "tool run failed",
    );

    return { error: message };
  }
}
