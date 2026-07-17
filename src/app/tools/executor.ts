import { createToolExecutor } from "../../framework/tools/executor.js";
import { logger } from "../logging/logger.js";
import { toolRegistry } from "./registry.js";
import type { ToolRunTraceContext } from "../../framework/tools/types.js";

export const runTool: (
  name: string,
  args: unknown,
  traceContext?: ToolRunTraceContext,
) => Promise<unknown> = createToolExecutor(toolRegistry, {
  logger,
});
