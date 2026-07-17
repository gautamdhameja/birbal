// Purpose: Provides lightweight OpenInference-style trace helpers for eval runs.
// Scope: Records JSON-serializable spans without requiring an observability backend.

import { randomUUID } from "node:crypto";

import type { AgentLifecycleHooks } from "../agent/types.js";
import type { ChatMessage } from "../llm/types.js";
import { preview } from "../logging/preview.js";
import type { EvalTrace, EvalTraceSpan, EvalTraceStatus } from "./types.js";

export const OPENINFERENCE = {
  ATTRIBUTES: {
    INPUT_VALUE: "input.value",
    LLM_INPUT_MESSAGES: "llm.input_messages",
    LLM_MODEL_NAME: "llm.model_name",
    LLM_OUTPUT_MESSAGES: "llm.output_messages",
    OUTPUT_VALUE: "output.value",
    SPAN_KIND: "openinference.span.kind",
    TOOL_NAME: "tool.name",
    TOOL_PARAMETERS: "tool.parameters",
  },
  SPAN_KIND: {
    AGENT: "AGENT",
    CHAIN: "CHAIN",
    LLM: "LLM",
    TOOL: "TOOL",
  },
} as const;

type SpanInput = {
  name: string;
  parentSpanId?: string;
  status?: EvalTraceStatus;
  attributes?: Record<string, unknown>;
};

type ActiveSpan = {
  spanId: string;
  name: string;
  parentSpanId?: string;
  startedAt: Date;
  attributes: Record<string, unknown>;
};

type TraceRecorderOptions = {
  idFactory?: () => string;
  maxAttributeChars?: number;
  maxMessages?: number;
  now?: () => Date;
};

type TraceMessage = {
  role: ChatMessage["role"];
  content: string;
};

const DEFAULT_MAX_ATTRIBUTE_CHARS = 2_000;
const DEFAULT_MAX_MESSAGES = 12;

function iso(value: Date): string {
  return value.toISOString();
}

export class OpenInferenceTraceRecorder {
  readonly traceId: string;
  private readonly spans: EvalTraceSpan[] = [];
  private readonly activeSpans = new Map<string, ActiveSpan>();
  private readonly idFactory: () => string;
  private readonly maxAttributeChars: number;
  private readonly maxMessages: number;
  private readonly now: () => Date;

  constructor(options: TraceRecorderOptions = {}) {
    this.idFactory = options.idFactory ?? randomUUID;
    this.maxAttributeChars = options.maxAttributeChars ?? DEFAULT_MAX_ATTRIBUTE_CHARS;
    this.maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;
    this.now = options.now ?? (() => new Date());
    this.traceId = this.idFactory();
  }

  startSpan(input: SpanInput): string {
    const spanId = this.idFactory();
    this.activeSpans.set(spanId, {
      spanId,
      name: input.name,
      parentSpanId: input.parentSpanId,
      startedAt: this.now(),
      attributes: input.attributes ?? {},
    });

    return spanId;
  }

  endSpan(
    spanId: string,
    options: { attributes?: Record<string, unknown>; status?: EvalTraceStatus } = {},
  ): void {
    const active = this.activeSpans.get(spanId);
    if (!active) {
      return;
    }

    this.activeSpans.delete(spanId);
    const endedAt = this.now();
    this.spans.push({
      traceId: this.traceId,
      spanId: active.spanId,
      ...(active.parentSpanId ? { parentSpanId: active.parentSpanId } : {}),
      name: active.name,
      startedAt: iso(active.startedAt),
      endedAt: iso(endedAt),
      status: options.status ?? "ok",
      attributes: {
        ...active.attributes,
        ...(options.attributes ?? {}),
      },
    });
  }

  recordSpan(input: SpanInput): string {
    const spanId = this.startSpan(input);
    this.endSpan(spanId, { status: input.status });
    return spanId;
  }

  trace(): EvalTrace {
    return {
      traceId: this.traceId,
      spans: [...this.spans],
    };
  }

  formatValue(value: unknown): string {
    return preview(value, this.maxAttributeChars);
  }

  formatMessages(messages: readonly ChatMessage[]): TraceMessage[] {
    return messages.slice(-this.maxMessages).map((message) => ({
      role: message.role,
      content: this.formatValue(message.content),
    }));
  }
}

export function createOpenInferenceAgentHooks(
  recorder: OpenInferenceTraceRecorder,
  options: { modelName: string },
): AgentLifecycleHooks {
  const llmSpanByPassId = new Map<string, string>();
  const toolSpanByPassId = new Map<string, string>();

  return {
    beforeModelCall(context) {
      llmSpanByPassId.set(
        context.modelPassId,
        recorder.startSpan({
          name: "agent.model_call",
          attributes: {
            [OPENINFERENCE.ATTRIBUTES.SPAN_KIND]: OPENINFERENCE.SPAN_KIND.LLM,
            [OPENINFERENCE.ATTRIBUTES.LLM_MODEL_NAME]: options.modelName,
            [OPENINFERENCE.ATTRIBUTES.LLM_INPUT_MESSAGES]: recorder.formatMessages(
              context.messages,
            ),
          },
        }),
      );
    },
    afterModelCall(context) {
      const spanId = llmSpanByPassId.get(context.modelPassId);
      if (!spanId) {
        return;
      }

      recorder.endSpan(spanId, {
        attributes: {
          [OPENINFERENCE.ATTRIBUTES.LLM_OUTPUT_MESSAGES]: [
            {
              role: "assistant",
              content: recorder.formatValue(context.raw),
            },
          ],
          [OPENINFERENCE.ATTRIBUTES.OUTPUT_VALUE]: recorder.formatValue(context.raw),
        },
      });
      llmSpanByPassId.delete(context.modelPassId);
    },
    beforeToolCall(context) {
      toolSpanByPassId.set(
        context.modelPassId,
        recorder.startSpan({
          name: `tool.${context.tool}`,
          attributes: {
            [OPENINFERENCE.ATTRIBUTES.SPAN_KIND]: OPENINFERENCE.SPAN_KIND.TOOL,
            [OPENINFERENCE.ATTRIBUTES.TOOL_NAME]: context.tool,
            [OPENINFERENCE.ATTRIBUTES.TOOL_PARAMETERS]: recorder.formatValue(context.args),
          },
        }),
      );
    },
    afterToolCall(context) {
      const spanId = toolSpanByPassId.get(context.modelPassId);
      if (!spanId) {
        return;
      }

      recorder.endSpan(spanId, {
        attributes: {
          [OPENINFERENCE.ATTRIBUTES.OUTPUT_VALUE]: recorder.formatValue(context.result),
        },
      });
      toolSpanByPassId.delete(context.modelPassId);
    },
    onParseFailure(context) {
      recorder.recordSpan({
        name: "agent.parse_failure",
        status: "error",
        attributes: {
          [OPENINFERENCE.ATTRIBUTES.SPAN_KIND]: OPENINFERENCE.SPAN_KIND.CHAIN,
          [OPENINFERENCE.ATTRIBUTES.INPUT_VALUE]: recorder.formatValue(context.raw),
          [OPENINFERENCE.ATTRIBUTES.OUTPUT_VALUE]: recorder.formatValue(context.error),
        },
      });
    },
    onResponseParsed(context) {
      recorder.recordSpan({
        name: "agent.response_parsed",
        attributes: {
          [OPENINFERENCE.ATTRIBUTES.SPAN_KIND]: OPENINFERENCE.SPAN_KIND.AGENT,
          [OPENINFERENCE.ATTRIBUTES.OUTPUT_VALUE]: recorder.formatValue(context.response),
        },
      });
    },
  };
}
