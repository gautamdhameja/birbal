import type { z } from "zod";

import { AGENT } from "../../constants/agent.js";
import {
  completeStructuredWithRepair,
  describeJsonSchema,
  ModelParseError,
} from "../llm/repair.js";
import type { ChatMessage, CompleteOptions } from "../../llama/schema.js";

type CompleteFn = (messages: ChatMessage[], options?: CompleteOptions) => Promise<string>;

export type RubricScale = {
  min: number;
  max: number;
  label?: string;
  descriptions?: Record<string, string>;
};

export type RubricCriterion = {
  id: string;
  description: string;
  scale?: RubricScale;
};

export type Rubric<TScore extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  description: string;
  scale: RubricScale;
  criteria: RubricCriterion[];
  weights: Record<string, number>;
  hardRejectionRules: string[];
  outputSchema: z.ZodType<TScore>;
};

export type RubricScoreResult<TScore extends Record<string, unknown>> = TScore & {
  finalScore: number;
};

export type RubricScoringContext = {
  traceId?: string;
  traceLabel?: string;
  temperature?: number;
  maxTokens?: number;
  completeFn?: CompleteFn;
  metadata?: Record<string, unknown>;
};

const DEFAULT_TEMPERATURE = 0;
const DEFAULT_MAX_TOKENS = 1_000;

function renderRubric(rubric: Rubric): string {
  return JSON.stringify({
    id: rubric.id,
    description: rubric.description,
    scale: rubric.scale,
    criteria: rubric.criteria,
    weights: rubric.weights,
    hardRejectionRules: rubric.hardRejectionRules,
  });
}

function renderItem(item: unknown): string {
  return JSON.stringify(item);
}

function renderOutputShape(rubric: Rubric): string {
  return JSON.stringify({
    ...Object.fromEntries(
      rubric.criteria.map((criterion) => [criterion.id, criterion.scale?.min ?? rubric.scale.min]),
    ),
    rejected: false,
    rejectionReason: "required only when rejected is true",
    reason: "short scoring rationale",
  });
}

function buildScoreMessages(item: unknown, rubric: Rubric): ChatMessage[] {
  return [
    {
      role: AGENT.ROLES.SYSTEM,
      content: [
        "You are a rubric-based scoring component.",
        "Return exactly one valid JSON object and nothing else.",
        "Do not include Markdown, code fences, comments, or prose outside JSON.",
        "Apply hard rejection rules before weighted scoring.",
      ].join(" "),
    },
    {
      role: AGENT.ROLES.USER,
      content: [
        "Rubric:",
        renderRubric(rubric),
        "",
        "Target output JSON shape:",
        renderOutputShape(rubric),
        "",
        "Item:",
        renderItem(item),
        "",
        "Return one JSON object matching the target output JSON shape.",
        "All numeric criteria must use the rubric scale.",
        "If rejected is false, omit rejectionReason.",
        "If rejected is true, include a concise rejectionReason.",
      ].join("\n"),
    },
  ];
}

function numericScore(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function calculateWeightedFinalScore(
  score: Record<string, unknown>,
  weights: Record<string, number>,
): number {
  if (score.rejected === true) {
    return 0;
  }

  let finalScore = 0;
  for (const [field, weight] of Object.entries(weights)) {
    const value = numericScore(score[field]);
    if (value === undefined) {
      continue;
    }

    finalScore += value * weight;
  }

  return finalScore;
}

export async function scoreItem<TScore extends Record<string, unknown>>(
  item: unknown,
  rubric: Rubric<TScore>,
  context: RubricScoringContext = {},
): Promise<RubricScoreResult<TScore>> {
  const schemaDescription = describeJsonSchema(rubric.outputSchema);
  const result = await completeStructuredWithRepair({
    messages: buildScoreMessages(item, rubric),
    schema: rubric.outputSchema,
    completeFn: context.completeFn,
    schemaDescription,
    repairInstructions:
      "Repair the rubric score response so it is valid JSON and matches the output schema exactly.",
    completeOptions: {
      temperature: context.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: context.maxTokens ?? DEFAULT_MAX_TOKENS,
      traceId: context.traceId,
      traceLabel: context.traceLabel ?? `rubric_score.${rubric.id}`,
    },
  });

  if (!result.ok) {
    throw new ModelParseError(result.error);
  }

  return {
    ...result.value,
    finalScore: calculateWeightedFinalScore(result.value, rubric.weights),
  };
}
