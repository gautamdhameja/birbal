// Purpose: Implements the Birbal tool module: executor.
// Scope: Defines concrete tools and wires them into the generic tool framework.

import { createToolExecutor } from "../framework/tools/executor.js";
import { logger } from "../logging/logger.js";
import { toolRegistry } from "./registry.js";
import type { ToolRunTraceContext } from "../framework/tools/types.js";

export type { ToolRunTraceContext } from "../framework/tools/types.js";

export const runTool: (
  name: string,
  args: unknown,
  traceContext?: ToolRunTraceContext,
) => Promise<unknown> = createToolExecutor(toolRegistry, {
  logger,
});
