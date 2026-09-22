import type { AgentHarnessConfig, AgentResponse } from "../../framework/agent/types.js";
import type { z } from "zod";

export type BirbalAgentDependencies = Pick<
  AgentHarnessConfig,
  "modelClient" | "toolRunner" | "buildSystemPrompt" | "renderToolsForPrompt" | "logger"
> & {
  responseSchema?: z.ZodType<AgentResponse>;
};
