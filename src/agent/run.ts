import { randomUUID } from "node:crypto";

import { z } from "zod";

import { AGENT } from "../constants.js";
import { logger } from "../logging/logger.js";
import { complete } from "../llama/client.js";
import type { ChatMessage } from "../llama/schema.js";
import { renderToolsForPrompt } from "../tools/registry.js";
import { runTool } from "../tools/runner.js";
import { parseAgentResponse } from "./parse-response.js";
import { buildSystemPrompt } from "./prompts.js";

const RunAgentOptionsSchema = z.strictObject({
  maxSteps: z.number().int().positive().optional(),
});

type RunAgentOptions = z.infer<typeof RunAgentOptionsSchema>;

function buildToolResultMessage(tool: string, result: unknown): ChatMessage {
  return {
    role: AGENT.ROLES.USER,
    content: JSON.stringify({
      type: AGENT.TOOL_RESULT_TYPE,
      tool,
      result,
    }),
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runAgent(task: string, options: RunAgentOptions = {}): Promise<string> {
  const parsedOptions = RunAgentOptionsSchema.parse(options);
  const maxSteps = parsedOptions.maxSteps ?? AGENT.DEFAULT_MAX_STEPS;
  const traceId = randomUUID();
  const messages: ChatMessage[] = [
    {
      role: AGENT.ROLES.SYSTEM,
      content: buildSystemPrompt(renderToolsForPrompt()),
    },
    {
      role: AGENT.ROLES.USER,
      content: task,
    },
  ];

  logger.debug(
    {
      event: AGENT.LOG_EVENTS.RUN_START,
      traceId,
      task,
      maxSteps,
    },
    AGENT.LOG_MESSAGES.RUN_START,
  );

  for (let step = 0; step < maxSteps; step += 1) {
    const modelPassId = randomUUID();

    logger.debug(
      {
        event: AGENT.LOG_EVENTS.HARNESS_TO_MODEL,
        traceId,
        modelPassId,
        step,
        messages,
      },
      AGENT.LOG_MESSAGES.HARNESS_TO_MODEL,
    );

    const raw = await complete(messages);

    logger.debug(
      {
        event: AGENT.LOG_EVENTS.MODEL_TO_HARNESS,
        traceId,
        modelPassId,
        step,
        raw,
      },
      AGENT.LOG_MESSAGES.MODEL_TO_HARNESS,
    );

    const parsed = (() => {
      try {
        return parseAgentResponse(raw);
      } catch (error) {
        const message = getErrorMessage(error);

        logger.debug(
          {
            event: AGENT.LOG_EVENTS.RESPONSE_PARSE_FAILED,
            traceId,
            modelPassId,
            step,
            raw,
            error: message,
          },
          AGENT.LOG_MESSAGES.RESPONSE_PARSE_FAILED,
        );

        return { error: message };
      }
    })();

    if ("error" in parsed) {
      return `${AGENT.ERRORS.INVALID_RESPONSE_PREFIX} ${parsed.error}`;
    }

    messages.push({
      role: AGENT.ROLES.ASSISTANT,
      content: raw,
    });

    logger.debug(
      {
        event: AGENT.LOG_EVENTS.RESPONSE_PARSED,
        traceId,
        modelPassId,
        step,
        parsed,
      },
      AGENT.LOG_MESSAGES.RESPONSE_PARSED,
    );

    if (parsed.type === AGENT.RESPONSE_TYPES.FINAL) {
      logger.debug(
        {
          event: AGENT.LOG_EVENTS.RUN_FINAL,
          traceId,
          modelPassId,
          step,
          answer: parsed.answer,
        },
        AGENT.LOG_MESSAGES.RUN_FINAL,
      );
      return parsed.answer;
    }

    if (parsed.type === AGENT.RESPONSE_TYPES.CLARIFY) {
      logger.debug(
        {
          event: AGENT.LOG_EVENTS.RUN_CLARIFY,
          traceId,
          modelPassId,
          step,
          question: parsed.question,
        },
        AGENT.LOG_MESSAGES.RUN_CLARIFY,
      );
      return `${AGENT.ERRORS.CLARIFICATION_PREFIX} ${parsed.question}`;
    }

    logger.debug(
      {
        event: AGENT.LOG_EVENTS.HARNESS_TO_TOOL,
        traceId,
        modelPassId,
        step,
        tool: parsed.tool,
        args: parsed.args,
      },
      AGENT.LOG_MESSAGES.HARNESS_TO_TOOL,
    );

    const result = await runTool(parsed.tool, parsed.args, {
      traceId,
      modelPassId,
      step,
    });

    logger.debug(
      {
        event: AGENT.LOG_EVENTS.TOOL_TO_HARNESS,
        traceId,
        modelPassId,
        step,
        tool: parsed.tool,
        result,
      },
      AGENT.LOG_MESSAGES.TOOL_TO_HARNESS,
    );

    const toolResultMessage = buildToolResultMessage(parsed.tool, result);
    messages.push(toolResultMessage);

    logger.debug(
      {
        event: AGENT.LOG_EVENTS.APPEND_TOOL_RESULT,
        traceId,
        modelPassId,
        step,
        message: toolResultMessage,
      },
      AGENT.LOG_MESSAGES.APPEND_TOOL_RESULT,
    );
  }

  logger.debug(
    {
      event: AGENT.LOG_EVENTS.MAX_STEPS,
      traceId,
      maxSteps,
    },
    AGENT.LOG_MESSAGES.MAX_STEPS,
  );

  return `${AGENT.ERRORS.MAX_STEPS_PREFIX} ${maxSteps}.`;
}
