import type { AgentRunOptions } from "../../framework/agent/types.js";
import type { DebugWarnLogger } from "../../framework/logging/debug-warn.js";
import type {
  ArchitectureLabInputPort,
  ArchitectureLabSession,
  ArchitectureLabSessionOutput,
} from "../architecture-lab/session.js";
import type { AppLoggingOptions } from "../logging/types.js";

export type ArchitectureLabSessionFactoryOptions = {
  input: ArchitectureLabInputPort;
  onOutput?: (output: ArchitectureLabSessionOutput) => void;
};

export type BirbalRuntime = {
  runAgent(task: string, options?: AgentRunOptions): Promise<string>;
  renderToolsForPrompt(): string;
  createLabSession(options: ArchitectureLabSessionFactoryOptions): ArchitectureLabSession;
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
