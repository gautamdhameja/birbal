// Purpose: Implements the framework agent harness orchestrator.
// Scope: Stays generic so applications can plug in their own components.

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { preview } from "../../logging/preview.js";
import type { ChatMessage } from "../llm/types.js";
import { FRAMEWORK_AGENT } from "./constants.js";
import type { AgentHarnessConfig, AgentRunOptions, AgentResponse } from "./types.js";

const AgentRunOptionsSchema = z.strictObject({
  maxSteps: z.number().int().positive().optional(),
});

function buildToolResultMessage({
  role,
  tool,
  toolResultType,
  result,
}: {
  role: ChatMessage["role"];
  tool: string;
  toolResultType: string;
  result: unknown;
}): ChatMessage {
  return {
    role,
    content: JSON.stringify({
      type: toolResultType,
      tool,
      result,
    }),
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createAgentHarness<TParsedResponse extends AgentResponse = AgentResponse>(
  config: AgentHarnessConfig<TParsedResponse>,
): (task: string, options?: AgentRunOptions) => Promise<string> {
  const roles = config.roles ?? {
    system: FRAMEWORK_AGENT.ROLES.SYSTEM,
    user: FRAMEWORK_AGENT.ROLES.USER,
    assistant: FRAMEWORK_AGENT.ROLES.ASSISTANT,
  };
  const messages = config.messages ?? {
    toolResultType: FRAMEWORK_AGENT.TOOL_RESULT_TYPE,
    clarificationPrefix: FRAMEWORK_AGENT.ERRORS.CLARIFICATION_PREFIX,
    invalidResponsePrefix: FRAMEWORK_AGENT.ERRORS.INVALID_RESPONSE_PREFIX,
    maxStepsPrefix: FRAMEWORK_AGENT.ERRORS.MAX_STEPS_PREFIX,
  };

  return async (task, options = {}) => {
    const parsedOptions = AgentRunOptionsSchema.parse(options);
    const maxSteps = parsedOptions.maxSteps ?? config.defaultMaxSteps;
    const traceId = randomUUID();
    const history: ChatMessage[] = [
      {
        role: roles.system,
        content: config.buildSystemPrompt(config.renderToolsForPrompt()),
      },
      {
        role: roles.user,
        content: task,
      },
    ];

    config.logger?.debug(
      {
        event: FRAMEWORK_AGENT.LOG_EVENTS.RUN_START,
        traceId,
        taskPreview: preview(task),
        maxSteps,
      },
      FRAMEWORK_AGENT.LOG_MESSAGES.RUN_START,
    );

    for (let step = 0; step < maxSteps; step += 1) {
      const modelPassId = randomUUID();

      config.logger?.debug(
        {
          event: FRAMEWORK_AGENT.LOG_EVENTS.HARNESS_TO_MODEL,
          traceId,
          modelPassId,
          step,
          messageCount: history.length,
          lastMessageLength: history.at(-1)?.content.length ?? 0,
        },
        FRAMEWORK_AGENT.LOG_MESSAGES.HARNESS_TO_MODEL,
      );

      await config.hooks?.beforeModelCall?.({
        traceId,
        modelPassId,
        step,
        messages: history,
      });
      const raw = await config.modelClient.complete(history, config.modelOptions);
      await config.hooks?.afterModelCall?.({
        traceId,
        modelPassId,
        step,
        raw,
      });

      config.logger?.debug(
        {
          event: FRAMEWORK_AGENT.LOG_EVENTS.MODEL_TO_HARNESS,
          traceId,
          modelPassId,
          step,
          rawLength: raw.length,
        },
        FRAMEWORK_AGENT.LOG_MESSAGES.MODEL_TO_HARNESS,
      );

      let parsed:
        | TParsedResponse
        | {
            error: string;
          };
      try {
        parsed = config.parseResponse(raw);
      } catch (error) {
        const message = getErrorMessage(error);

        config.logger?.debug(
          {
            event: FRAMEWORK_AGENT.LOG_EVENTS.RESPONSE_PARSE_FAILED,
            traceId,
            modelPassId,
            step,
            rawLength: raw.length,
            error: message,
          },
          FRAMEWORK_AGENT.LOG_MESSAGES.RESPONSE_PARSE_FAILED,
        );

        await config.hooks?.onParseFailure?.({
          traceId,
          modelPassId,
          step,
          raw,
          error: message,
        });

        parsed = { error: message };
      }

      if ("error" in parsed) {
        return `${messages.invalidResponsePrefix} ${parsed.error}`;
      }

      history.push({
        role: roles.assistant,
        content: raw,
      });

      config.logger?.debug(
        {
          event: FRAMEWORK_AGENT.LOG_EVENTS.RESPONSE_PARSED,
          traceId,
          modelPassId,
          step,
          parsedType: parsed.type,
        },
        FRAMEWORK_AGENT.LOG_MESSAGES.RESPONSE_PARSED,
      );
      await config.hooks?.onResponseParsed?.({
        traceId,
        modelPassId,
        step,
        response: parsed,
      });

      if (parsed.type === "final") {
        config.logger?.debug(
          {
            event: FRAMEWORK_AGENT.LOG_EVENTS.RUN_FINAL,
            traceId,
            modelPassId,
            step,
            answerPreview: preview(parsed.answer),
          },
          FRAMEWORK_AGENT.LOG_MESSAGES.RUN_FINAL,
        );
        return parsed.answer;
      }

      if (parsed.type === "clarify") {
        config.logger?.debug(
          {
            event: FRAMEWORK_AGENT.LOG_EVENTS.RUN_CLARIFY,
            traceId,
            modelPassId,
            step,
            question: parsed.question,
          },
          FRAMEWORK_AGENT.LOG_MESSAGES.RUN_CLARIFY,
        );
        return `${messages.clarificationPrefix} ${parsed.question}`;
      }

      config.logger?.debug(
        {
          event: FRAMEWORK_AGENT.LOG_EVENTS.HARNESS_TO_TOOL,
          traceId,
          modelPassId,
          step,
          tool: parsed.tool,
          argsPreview: preview(parsed.args),
        },
        FRAMEWORK_AGENT.LOG_MESSAGES.HARNESS_TO_TOOL,
      );

      await config.hooks?.beforeToolCall?.({
        traceId,
        modelPassId,
        step,
        tool: parsed.tool,
        args: parsed.args,
      });
      const result = await config.toolRunner(parsed.tool, parsed.args, {
        traceId,
        modelPassId,
        step,
      });
      await config.hooks?.afterToolCall?.({
        traceId,
        modelPassId,
        step,
        tool: parsed.tool,
        args: parsed.args,
        result,
      });

      config.logger?.debug(
        {
          event: FRAMEWORK_AGENT.LOG_EVENTS.TOOL_TO_HARNESS,
          traceId,
          modelPassId,
          step,
          tool: parsed.tool,
          resultPreview: preview(result),
        },
        FRAMEWORK_AGENT.LOG_MESSAGES.TOOL_TO_HARNESS,
      );

      const toolResultMessage = buildToolResultMessage({
        role: roles.user,
        tool: parsed.tool,
        toolResultType: messages.toolResultType,
        result,
      });
      history.push(toolResultMessage);

      config.logger?.debug(
        {
          event: FRAMEWORK_AGENT.LOG_EVENTS.APPEND_TOOL_RESULT,
          traceId,
          modelPassId,
          step,
          messageLength: toolResultMessage.content.length,
        },
        FRAMEWORK_AGENT.LOG_MESSAGES.APPEND_TOOL_RESULT,
      );
    }

    config.logger?.debug(
      {
        event: FRAMEWORK_AGENT.LOG_EVENTS.MAX_STEPS,
        traceId,
        maxSteps,
      },
      FRAMEWORK_AGENT.LOG_MESSAGES.MAX_STEPS,
    );
    await config.hooks?.onMaxSteps?.({
      traceId,
      maxSteps,
    });

    return `${messages.maxStepsPrefix} ${maxSteps}.`;
  };
}
