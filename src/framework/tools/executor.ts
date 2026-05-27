import { z } from "zod";

import { preview } from "../../logging/preview.js";
import type { PipelineLogger } from "../pipeline/types.js";
import { FRAMEWORK_TOOLS } from "./constants.js";
import type { ToolRegistry } from "./registry.js";
import type { ToolError, ToolRunTraceContext } from "./types.js";

export type ToolRunnerOptions = {
  timeoutMs?: number;
  logger?: Pick<PipelineLogger, "debug">;
};

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  const timeout = new Promise<never>((_resolve, reject) => {
    signal.addEventListener(
      "abort",
      () => reject(new Error(`${FRAMEWORK_TOOLS.ERRORS.TIMEOUT_PREFIX} ${timeoutMs}ms.`)),
      { once: true },
    );
  });

  return Promise.race([run(signal), timeout]);
}

function logDebug(
  logger: ToolRunnerOptions["logger"],
  payload: Record<string, unknown>,
  message: string,
): void {
  logger?.debug(payload, message);
}

export function createToolExecutor(
  registry: ToolRegistry,
  options: ToolRunnerOptions = {},
): (
  name: string,
  args: unknown,
  traceContext?: ToolRunTraceContext,
) => Promise<unknown | ToolError> {
  const timeoutMs = options.timeoutMs ?? FRAMEWORK_TOOLS.RUN_TIMEOUT_MS;

  return async (name, args, traceContext = {}) => {
    const tool = registry.get(name);
    if (!tool) {
      logDebug(
        options.logger,
        {
          ...traceContext,
          event: FRAMEWORK_TOOLS.RUNNER_EVENTS.LOOKUP_FAILED,
          tool: name,
        },
        FRAMEWORK_TOOLS.RUNNER_MESSAGES.LOOKUP_FAILED,
      );
      return { error: `${FRAMEWORK_TOOLS.ERRORS.UNKNOWN_PREFIX} ${name}` };
    }

    const parsedArgs = tool.argsSchema.safeParse(args);
    if (!parsedArgs.success) {
      logDebug(
        options.logger,
        {
          ...traceContext,
          event: FRAMEWORK_TOOLS.RUNNER_EVENTS.ARGS_INVALID,
          tool: name,
          argsPreview: preview(args),
          validationError: z.prettifyError(parsedArgs.error),
        },
        FRAMEWORK_TOOLS.RUNNER_MESSAGES.ARGS_INVALID,
      );
      return {
        error: `${FRAMEWORK_TOOLS.ERRORS.INVALID_ARGS_PREFIX} "${name}": ${z.prettifyError(parsedArgs.error)}`,
      };
    }

    try {
      logDebug(
        options.logger,
        {
          ...traceContext,
          event: FRAMEWORK_TOOLS.RUNNER_EVENTS.RUN_START,
          tool: name,
          argsPreview: preview(parsedArgs.data),
        },
        FRAMEWORK_TOOLS.RUNNER_MESSAGES.RUN_START,
      );

      const result = await withTimeout(
        (signal) => tool.run(parsedArgs.data, { signal }),
        timeoutMs,
      );
      const parsedResult = tool.resultSchema.safeParse(result);
      if (!parsedResult.success) {
        return {
          error: `${FRAMEWORK_TOOLS.ERRORS.INVALID_RESULT_PREFIX} "${name}": ${z.prettifyError(parsedResult.error)}`,
        };
      }

      logDebug(
        options.logger,
        {
          ...traceContext,
          event: FRAMEWORK_TOOLS.RUNNER_EVENTS.RUN_SUCCESS,
          tool: name,
          resultPreview: preview(parsedResult.data),
        },
        FRAMEWORK_TOOLS.RUNNER_MESSAGES.RUN_SUCCESS,
      );

      return parsedResult.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logDebug(
        options.logger,
        {
          ...traceContext,
          event: FRAMEWORK_TOOLS.RUNNER_EVENTS.RUN_ERROR,
          tool: name,
          error: message,
        },
        FRAMEWORK_TOOLS.RUNNER_MESSAGES.RUN_ERROR,
      );

      return { error: message };
    }
  };
}
