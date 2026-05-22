import { z } from "zod";

import { TOOLS } from "../constants/tools.js";
import { logger } from "../logging/logger.js";
import { preview } from "../logging/preview.js";
import { getTool } from "./registry.js";
import type { ToolError } from "./types.js";

export type ToolRunTraceContext = {
  traceId?: string;
  modelPassId?: string;
  step?: number;
};

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      controller.abort();
      reject(new Error(`${TOOLS.ERRORS.TIMEOUT_PREFIX} ${timeoutMs}ms.`));
    }, timeoutMs);

    run(controller.signal).then(
      (value) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

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
        argsPreview: preview(args),
        validationError: z.prettifyError(parsedArgs.error),
      },
      TOOLS.RUNNER_MESSAGES.ARGS_INVALID,
    );
    return {
      error: `${TOOLS.ERRORS.INVALID_ARGS_PREFIX} "${name}": ${z.prettifyError(parsedArgs.error)}`,
    };
  }

  try {
    logger.debug(
      {
        ...traceContext,
        event: TOOLS.RUNNER_EVENTS.RUN_START,
        tool: name,
        argsPreview: preview(parsedArgs.data),
      },
      TOOLS.RUNNER_MESSAGES.RUN_START,
    );

    const result = await withTimeout(
      (signal) => tool.run(parsedArgs.data, { signal }),
      TOOLS.RUN_TIMEOUT_MS,
    );
    const parsedResult = tool.resultSchema.safeParse(result);
    if (!parsedResult.success) {
      return {
        error: `${TOOLS.ERRORS.INVALID_RESULT_PREFIX} "${name}": ${z.prettifyError(parsedResult.error)}`,
      };
    }

    logger.debug(
      {
        ...traceContext,
        event: TOOLS.RUNNER_EVENTS.RUN_SUCCESS,
        tool: name,
        resultPreview: preview(parsedResult.data),
      },
      TOOLS.RUNNER_MESSAGES.RUN_SUCCESS,
    );

    return parsedResult.data;
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
