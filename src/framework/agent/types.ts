// Purpose: Implements the framework agent types module.
// Scope: Stays generic so applications can plug in their own components.

import type { ChatMessage, ModelClient, ModelCompleteOptions } from "../llm/types.js";
import type { ToolRunTraceContext } from "../tools/types.js";

export type AgentFinalResponse = {
  type: "final";
  answer: string;
};

export type AgentClarifyResponse = {
  type: "clarify";
  question: string;
};

export type AgentToolCallResponse = {
  type: "tool_call";
  tool: string;
  args: unknown;
};

export type AgentResponse = AgentFinalResponse | AgentClarifyResponse | AgentToolCallResponse;

export type AgentLogger = {
  debug(payload: Record<string, unknown>, message?: string): void;
};

export type ToolRunner = (
  name: string,
  args: unknown,
  traceContext?: ToolRunTraceContext,
) => Promise<unknown>;

export type AgentStepContext = {
  traceId: string;
  modelPassId: string;
  step: number;
};

export type AgentLifecycleHooks<TParsedResponse extends AgentResponse = AgentResponse> = {
  beforeModelCall?(
    context: AgentStepContext & { messages: readonly ChatMessage[] },
  ): void | Promise<void>;
  afterModelCall?(context: AgentStepContext & { raw: string }): void | Promise<void>;
  onParseFailure?(context: AgentStepContext & { raw: string; error: string }): void | Promise<void>;
  beforeToolCall?(
    context: AgentStepContext & { tool: string; args: unknown },
  ): void | Promise<void>;
  afterToolCall?(
    context: AgentStepContext & { tool: string; args: unknown; result: unknown },
  ): void | Promise<void>;
  onResponseParsed?(
    context: AgentStepContext & { response: TParsedResponse },
  ): void | Promise<void>;
  onMaxSteps?(context: { traceId: string; maxSteps: number }): void | Promise<void>;
};

export type AgentHarnessConfig<TParsedResponse extends AgentResponse = AgentResponse> = {
  modelClient: ModelClient;
  toolRunner: ToolRunner;
  buildSystemPrompt(renderedTools: string): string;
  renderToolsForPrompt(): string;
  parseResponse(raw: string): TParsedResponse;
  logger?: AgentLogger;
  hooks?: AgentLifecycleHooks<TParsedResponse>;
  defaultMaxSteps: number;
  maxParseRepairAttempts?: number;
  modelOptions?: ModelCompleteOptions;
  roles?: {
    system: ChatMessage["role"];
    user: ChatMessage["role"];
    assistant: ChatMessage["role"];
  };
  messages?: {
    toolResultType: string;
    clarificationPrefix: string;
    invalidResponsePrefix: string;
    maxStepsPrefix: string;
  };
};

export type AgentRunOptions = {
  maxSteps?: number;
};
