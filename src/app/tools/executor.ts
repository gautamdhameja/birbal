import { createToolExecutor } from "../../framework/tools/executor.js";
import type { ToolRunnerOptions } from "../../framework/tools/executor.js";
import type { ToolRegistry } from "../../framework/tools/registry.js";

export function createAppToolExecutor(registry: ToolRegistry, options: ToolRunnerOptions = {}) {
  return createToolExecutor(registry, options);
}
