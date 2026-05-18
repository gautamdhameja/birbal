import { z } from "zod";

import { TOOLS } from "../constants.js";
import { logger } from "../logging/logger.js";
import { getTool } from "./registry.js";
import type { ToolError } from "./types.js";

export type ToolRunTraceContext = {
  traceId?: string;
  modelPassId?: string;
  step?: number;
};

export async function runTool(
  name: string,
  args: unknown,
  traceContext: ToolRunTraceContext = {},
): Promise<unknown | ToolError> {
  const tool = getTool(name);
  if (!tool) {
    logger.debug(
      {
        ...traceContext,
        event: TOOLS.RUNNER_EVENTS.LOOKUP_FAILED,
        tool: name,
      },
      TOOLS.RUNNER_MESSAGES.LOOKUP_FAILED,
    );
    return { error: `${TOOLS.ERRORS.UNKNOWN_PREFIX} ${name}` };
  }

  const parsedArgs = tool.argsSchema.safeParse(args);
  if (!parsedArgs.success) {
    logger.debug(
      {
        ...traceContext,
        event: TOOLS.RUNNER_EVENTS.ARGS_INVALID,
        tool: name,
        args,
        validationError: z.prettifyError(parsedArgs.error),
      },
      TOOLS.RUNNER_MESSAGES.ARGS_INVALID,
    );
    return { error: `${TOOLS.ERRORS.INVALID_ARGS_PREFIX} "${name}": ${z.prettifyError(parsedArgs.error)}` };
  }

  try {
    logger.debug(
      {
        ...traceContext,
        event: TOOLS.RUNNER_EVENTS.RUN_START,
        tool: name,
        args: parsedArgs.data,
      },
      TOOLS.RUNNER_MESSAGES.RUN_START,
    );

    const result = await tool.run(parsedArgs.data);

    logger.debug(
      {
        ...traceContext,
        event: TOOLS.RUNNER_EVENTS.RUN_SUCCESS,
        tool: name,
        result,
      },
      TOOLS.RUNNER_MESSAGES.RUN_SUCCESS,
    );

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    logger.debug(
      {
        ...traceContext,
        event: TOOLS.RUNNER_EVENTS.RUN_ERROR,
        tool: name,
        error: message,
      },
      TOOLS.RUNNER_MESSAGES.RUN_ERROR,
    );

    return { error: message };
  }
}
