import { createAgentHarness, parseJsonAgentResponse } from "../../../framework/agent/index.js";
import {
  OPENINFERENCE,
  OpenInferenceTraceRecorder,
  createOpenInferenceAgentHooks,
} from "../../../framework/evals/openInference.js";
import type { EvalCase, EvalSuite } from "../../../framework/evals/types.js";
import type { ChatMessage, ModelClient } from "../../../framework/llm/types.js";
import { MODEL_PROVIDERS } from "../../constants/model-providers.js";
import { TOOLS } from "../../constants/tools.js";
import { expectEqual, expectIncludes, expectTrue } from "../assertions.js";

function scriptedModel(responses: readonly string[]): ModelClient & { calls: ChatMessage[][] } {
  const calls: ChatMessage[][] = [];

  return {
    calls,
    async complete(messages) {
      calls.push([...messages]);
      const response = responses[calls.length - 1];
      if (response === undefined) {
        throw new Error("scripted model response exhausted");
      }

      return response;
    },
  };
}

function toolRunner(calls: Array<{ name: string; args: unknown }>) {
  return async (name: string, args: unknown): Promise<unknown> => {
    calls.push({ name, args });
    if (name !== TOOLS.GET_TIME.NAME) {
      return { error: `unknown tool: ${name}` };
    }

    return {
      now: "2026-07-11T09:00:00.000+02:00",
    };
  };
}

function createEvalHarness(
  modelClient: ModelClient,
  toolCalls: Array<{ name: string; args: unknown }>,
  recorder: OpenInferenceTraceRecorder,
) {
  return createAgentHarness({
    modelClient,
    toolRunner: toolRunner(toolCalls),
    buildSystemPrompt: (tools) => `You are a JSON agent.\n${tools}`,
    renderToolsForPrompt: () => `${TOOLS.GET_TIME.NAME}: ${TOOLS.GET_TIME.DESCRIPTION}`,
    parseResponse: parseJsonAgentResponse,
    hooks: createOpenInferenceAgentHooks(recorder, {
      modelName: "eval-scripted-model",
    }),
    defaultMaxSteps: 4,
    maxParseRepairAttempts: 1,
    modelOptions: {
      temperature: 0,
      response_format: {
        type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT,
      },
    },
  });
}

function sequentialIdFactory(prefix: string): () => string {
  let index = 0;
  return () => `${prefix}-${(index += 1)}`;
}

const toolCallCase: EvalCase = {
  id: "agent_tool_loop",
  name: "agent uses a tool and returns a final answer",
  async run(context) {
    const modelClient = scriptedModel([
      JSON.stringify({
        type: "tool_call",
        tool: TOOLS.GET_TIME.NAME,
        args: {},
      }),
      JSON.stringify({
        type: "final",
        answer: "The current local time is 2026-07-11T09:00:00.000+02:00.",
      }),
    ]);
    const toolCalls: Array<{ name: string; args: unknown }> = [];
    const recorder = new OpenInferenceTraceRecorder({
      idFactory: sequentialIdFactory("agent-tool-loop"),
      now: context.now,
    });
    const run = createEvalHarness(modelClient, toolCalls, recorder);
    const answer = await run("Use a tool to get the current time.");
    const trace = recorder.trace();
    const spanKinds = trace.spans.map(
      (span) => span.attributes[OPENINFERENCE.ATTRIBUTES.SPAN_KIND],
    );

    return {
      assertions: [
        expectIncludes(
          "final answer includes tool result",
          answer,
          "2026-07-11T09:00:00.000+02:00",
        ),
        expectEqual("tool called once", toolCalls.length, 1),
        expectEqual("tool name", toolCalls[0]?.name, TOOLS.GET_TIME.NAME),
        expectEqual("model called twice", modelClient.calls.length, 2),
        expectTrue("trace contains llm span", spanKinds.includes(OPENINFERENCE.SPAN_KIND.LLM)),
        expectTrue("trace contains tool span", spanKinds.includes(OPENINFERENCE.SPAN_KIND.TOOL)),
      ],
      trace,
      metadata: {
        modelCalls: modelClient.calls.length,
        toolCalls: toolCalls.length,
      },
    };
  },
};

const parseRepairCase: EvalCase = {
  id: "agent_protocol_repair",
  name: "agent repairs one invalid protocol response",
  async run(context) {
    const modelClient = scriptedModel([
      "I should call a tool, but this is not JSON.",
      JSON.stringify({
        type: "final",
        answer: "Recovered after protocol repair.",
      }),
    ]);
    const toolCalls: Array<{ name: string; args: unknown }> = [];
    const recorder = new OpenInferenceTraceRecorder({
      idFactory: sequentialIdFactory("agent-protocol-repair"),
      now: context.now,
    });
    const run = createEvalHarness(modelClient, toolCalls, recorder);
    const answer = await run("Return a final response.");
    const trace = recorder.trace();
    const parseFailureSpans = trace.spans.filter((span) => span.name === "agent.parse_failure");

    return {
      assertions: [
        expectEqual("final answer", answer, "Recovered after protocol repair."),
        expectEqual("model called twice", modelClient.calls.length, 2),
        expectEqual("tool not called", toolCalls.length, 0),
        expectEqual("parse failure span count", parseFailureSpans.length, 1),
      ],
      trace,
      metadata: {
        modelCalls: modelClient.calls.length,
      },
    };
  },
};

export const agentHarnessEvalSuite: EvalSuite = {
  id: "agent_harness",
  name: "Agent Harness",
  description: "Protocol, tool-loop, repair, and OpenInference-style trace evals.",
  cases: [toolCallCase, parseRepairCase],
};
