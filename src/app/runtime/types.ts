import type { AgentRunOptions } from "../../framework/agent/types.js";

export type BirbalRuntime = {
  runAgent(task: string, options?: AgentRunOptions): Promise<string>;
  renderToolsForPrompt(): string;
};

export type BirbalRuntimeOptions = {
  trace?: boolean;
};

export type BirbalRuntimeLoader = (
  options?: BirbalRuntimeOptions,
) => BirbalRuntime | Promise<BirbalRuntime>;
