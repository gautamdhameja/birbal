import type { AgentHarnessConfig } from "../../framework/agent/types.js";

export type BirbalAgentDependencies = Pick<
  AgentHarnessConfig,
  "modelClient" | "toolRunner" | "buildSystemPrompt" | "renderToolsForPrompt" | "logger"
>;
