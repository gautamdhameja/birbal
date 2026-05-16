import { randomUUID } from "node:crypto";

import { z } from "zod";

import { logger } from "../logging/logger.js";
import { complete } from "../llama/client.js";
import type { ChatMessage } from "../llama/schema.js";
import { renderToolsForPrompt } from "../tools/registry.js";
import { runTool } from "../tools/runner.js";
import { parseAgentResponse } from "../utils/json.js";
import { buildSystemPrompt } from "./prompts.js";

const DEFAULT_MAX_STEPS = 8;

const RunAgentOptionsSchema = z.strictObject({
  maxSteps: z.number().int().positive().optional(),
});

type RunAgentOptions = z.infer<typeof RunAgentOptionsSchema>;

function buildToolResultMessage(tool: string, result: unknown): ChatMessage {
  return {
    role: "user",
    content: JSON.stringify({
      type: "tool_result",
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
  const maxSteps = parsedOptions.maxSteps ?? DEFAULT_MAX_STEPS;
  const traceId = randomUUID();
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(renderToolsForPrompt()),
    },
    {
      role: "user",
      content: task,
    },
  ];

  logger.debug(
    {
      event: "agent.run.start",
      traceId,
      task,
      maxSteps,
    },
    "agent run started",
  );

  for (let step = 0; step < maxSteps; step += 1) {
    const modelPassId = randomUUID();

    logger.debug(
      {
        event: "handoff.harness_to_model",
        traceId,
        modelPassId,
        step,
        messages,
      },
      "sending messages to model",
    );

    const raw = await complete(messages);

    logger.debug(
      {
        event: "handoff.model_to_harness",
        traceId,
        modelPassId,
        step,
        raw,
      },
      "received model response",
    );

    const parsed = (() => {
      try {
        return parseAgentResponse(raw);
      } catch (error) {
        const message = getErrorMessage(error);

        logger.debug(
          {
            event: "agent.response.parse_failed",
            traceId,
            modelPassId,
            step,
            raw,
            error: message,
          },
          "model response failed protocol parsing",
        );

        return { error: message };
      }
    })();

    if ("error" in parsed) {
      return `Agent returned an invalid response: ${parsed.error}`;
    }

    messages.push({
      role: "assistant",
      content: raw,
    });

    logger.debug(
      {
        event: "agent.response.parsed",
        traceId,
        modelPassId,
        step,
        parsed,
      },
      "parsed model response",
    );

    if (parsed.type === "final") {
      logger.debug(
        {
          event: "agent.run.final",
          traceId,
          modelPassId,
          step,
          answer: parsed.answer,
        },
        "agent run completed with final answer",
      );
      return parsed.answer;
    }

    if (parsed.type === "clarify") {
      logger.debug(
        {
          event: "agent.run.clarify",
          traceId,
          modelPassId,
          step,
          question: parsed.question,
        },
        "agent run completed with clarification request",
      );
      return `Clarification needed: ${parsed.question}`;
    }

    logger.debug(
      {
        event: "handoff.harness_to_tool",
        traceId,
        modelPassId,
        step,
        tool: parsed.tool,
        args: parsed.args,
      },
      "dispatching tool call",
    );

    const result = await runTool(parsed.tool, parsed.args, {
      traceId,
      modelPassId,
      step,
    });

    logger.debug(
      {
        event: "handoff.tool_to_harness",
        traceId,
        modelPassId,
        step,
        tool: parsed.tool,
        result,
      },
      "received tool result",
    );

    const toolResultMessage = buildToolResultMessage(parsed.tool, result);
    messages.push(toolResultMessage);

    logger.debug(
      {
        event: "agent.messages.append_tool_result",
        traceId,
        modelPassId,
        step,
        message: toolResultMessage,
      },
      "appended tool result message",
    );
  }

  logger.debug(
    {
      event: "agent.run.max_steps",
      traceId,
      maxSteps,
    },
    "agent run reached max step limit",
  );

  return `Agent stopped after reaching the maximum step limit of ${maxSteps}.`;
}
