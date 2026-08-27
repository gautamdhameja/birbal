import type { AgentRunOptions } from "../../framework/agent/types.js";
import type { DebugWarnLogger } from "../../framework/logging/debug-warn.js";
import type { AppLoggingOptions } from "../logging/types.js";

export type BirbalRuntime = {
  runAgent(task: string, options?: AgentRunOptions): Promise<string>;
  renderToolsForPrompt(): string;
};

export type BirbalRuntimeOptions = {
  trace?: boolean;
};

export type DefaultRuntimeDependencies = {
  createLogger?: (options?: AppLoggingOptions) => DebugWarnLogger;
};

export type BirbalRuntimeLoader = (
  options?: BirbalRuntimeOptions,
) => BirbalRuntime | Promise<BirbalRuntime>;
