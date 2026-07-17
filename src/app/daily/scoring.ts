// Purpose: Implements the daily reading pipeline support: scoring.
// Scope: Contains Birbal-specific digest scoring, classification, and rendering helpers.

import { z } from "zod";

import { AGENT } from "../constants/agent.js";
import { MODEL_PROVIDERS } from "../constants/model-providers.js";
import { SCORING } from "../constants/scoring.js";
import { completeStructuredWithRepair, ModelParseError } from "../../framework/llm/repair.js";
import type { ChatMessage, ModelClient, ModelCompleteOptions } from "../../framework/llm/types.js";
import { calculateWeightedFinalScore, type Rubric } from "../../framework/scoring/rubric.js";
import { logger } from "../logging/logger.js";
import { getDefaultModelClient } from "../model-providers/default.js";
import type { UserPreferences } from "../memory/types.js";
import {
  EnterpriseDailyScoreSchema,
  enterpriseDailyReadingRubric,
  type EnterpriseDailyScore,
} from "../pipelines/daily/rubric.js";
import { parseJson } from "../utils/json.js";
import type { CandidateItem, ItemScore, ScoredCandidateItem } from "./types.js";

const ScoreResponseSchema = EnterpriseDailyScoreSchema;
type ScoreResponse = EnterpriseDailyScore;
type ModelTraceOptions = Pick<ModelCompleteOptions, "traceId" | "traceLabel"> & {
  completeFn?: ModelClient["complete"];
  rubric?: Rubric<EnterpriseDailyScore>;
};
const ScoreBatchResponseSchema = z.strictObject({
  scores: z.array(
    ScoreResponseSchema.extend({
      id: z.string().min(1),
    }),
  ),
});

type ScoreBatchResponse = z.infer<typeof ScoreBatchResponseSchema>;

function scoreBatchResponseSchema(expectedIds: readonly string[]): z.ZodType<ScoreBatchResponse> {
  const expectedIdSet = new Set(expectedIds);

  return ScoreBatchResponseSchema.superRefine((response, context) => {
    if (response.scores.length !== expectedIds.length) {
      context.addIssue({
        code: "custom",
        message: `Expected exactly ${expectedIds.length} score(s), received ${response.scores.length}.`,
        path: ["scores"],
      });
    }

    const ids = new Set<string>();
    for (const [index, score] of response.scores.entries()) {
      if (!expectedIdSet.has(score.id)) {
        context.addIssue({
          code: "custom",
          message: `Unexpected score for candidate ${score.id}.`,
          path: ["scores", index, "id"],
        });
      }

      if (ids.has(score.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate score for candidate ${score.id}.`,
          path: ["scores", index, "id"],
        });
      }

      ids.add(score.id);
    }

    for (const id of expectedIds) {
      if (!ids.has(id)) {
        context.addIssue({
          code: "custom",
          message: `Missing score for candidate ${id}.`,
          path: ["scores"],
        });
      }
    }
  });
}

function renderList(items: readonly string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

function renderPreferencesForScoring(preferences: UserPreferences): string {
  return [
    `${SCORING.USER_PROMPT_LABELS.INTERESTS}:`,
    renderList(preferences.interests),
    "",
    `${SCORING.USER_PROMPT_LABELS.AVOID}:`,
    renderList(preferences.avoid),
    "",
    `${SCORING.USER_PROMPT_LABELS.PREFERRED_DIFFICULTY}:`,
    preferences.preferredDifficulty,
    "",
    `${SCORING.USER_PROMPT_LABELS.DAILY_MIX}:`,
    JSON.stringify(preferences.dailyMix),
  ].join("\n");
}

function renderCandidateForScoring(candidate: CandidateItem): string {
  return JSON.stringify({
    sourceId: candidate.sourceId,
    sourceName: candidate.sourceName,
    sourceType: candidate.sourceType,
    title: candidate.title,
    url: candidate.url,
    summary: candidate.summary,
    contentText: candidate.contentText?.slice(0, SCORING.CANDIDATE_CONTENT_MAX_CHARS),
    publishedAt: candidate.publishedAt,
    discoveredAt: candidate.discoveredAt,
    contentFetchStatus: candidate.contentFetchStatus,
  });
}

function renderRubricForScoring(rubric: Rubric<EnterpriseDailyScore>): string {
  return JSON.stringify({
    id: rubric.id,
    description: rubric.description,
    scale: rubric.scale,
    criteria: rubric.criteria,
    weights: rubric.weights,
    hardRejectionRules: rubric.hardRejectionRules,
  });
}

function renderCandidatesForBatchScoring(candidates: readonly CandidateItem[]): string {
  return JSON.stringify(
    candidates.map((candidate) => ({
      id: candidate.id,
      sourceId: candidate.sourceId,
      sourceName: candidate.sourceName,
      sourceType: candidate.sourceType,
      title: candidate.title,
      url: candidate.url,
      summary: candidate.summary,
      contentText: candidate.contentText?.slice(0, SCORING.CANDIDATE_CONTENT_MAX_CHARS),
      publishedAt: candidate.publishedAt,
      discoveredAt: candidate.discoveredAt,
      contentFetchStatus: candidate.contentFetchStatus,
    })),
  );
}

function buildScorePrompt(
  candidate: CandidateItem,
  preferences: UserPreferences,
  rubric: Rubric<EnterpriseDailyScore>,
): string {
  return [
    renderPreferencesForScoring(preferences),
    "",
    "Rubric:",
    renderRubricForScoring(rubric),
    "",
    `${SCORING.USER_PROMPT_LABELS.CANDIDATE}:`,
    renderCandidateForScoring(candidate),
    "",
    `${SCORING.USER_PROMPT_LABELS.RESPONSE_SHAPE}:`,
    JSON.stringify({
      [SCORING.RESPONSE_FIELDS.ENTERPRISE_RELEVANCE]: 1,
      [SCORING.RESPONSE_FIELDS.WORKFLOW_REDESIGN_DEPTH]: 1,
      [SCORING.RESPONSE_FIELDS.REAL_USE_CASE_SPECIFICITY]: 1,
      [SCORING.RESPONSE_FIELDS.DEPLOYMENT_FDE_RELEVANCE]: 1,
      [SCORING.RESPONSE_FIELDS.BUSINESS_OUTCOME_CLARITY]: 1,
      [SCORING.RESPONSE_FIELDS.TECHNICAL_IMPLEMENTATION_USEFULNESS]: 1,
      [SCORING.RESPONSE_FIELDS.RECENCY]: 1,
      [SCORING.RESPONSE_FIELDS.NON_GENERIC_INSIGHT]: 1,
      [SCORING.RESPONSE_FIELDS.REJECTED]: false,
      [SCORING.RESPONSE_FIELDS.REJECTION_REASON]: "only when rejected is true",
      [SCORING.RESPONSE_FIELDS.REASON]: "short enterprise deployment scoring explanation",
    }),
  ].join("\n");
}

function buildBatchScorePrompt(
  candidates: readonly CandidateItem[],
  preferences: UserPreferences,
  rubric: Rubric<EnterpriseDailyScore>,
): string {
  return [
    renderPreferencesForScoring(preferences),
    "",
    "Rubric:",
    renderRubricForScoring(rubric),
    "",
    `${SCORING.USER_PROMPT_LABELS.CANDIDATE}:`,
    renderCandidatesForBatchScoring(candidates),
    "",
    `${SCORING.USER_PROMPT_LABELS.RESPONSE_SHAPE}:`,
    JSON.stringify({
      scores: [
        {
          id: candidates[0]?.id ?? "candidate id",
          [SCORING.RESPONSE_FIELDS.ENTERPRISE_RELEVANCE]: 1,
          [SCORING.RESPONSE_FIELDS.WORKFLOW_REDESIGN_DEPTH]: 1,
          [SCORING.RESPONSE_FIELDS.REAL_USE_CASE_SPECIFICITY]: 1,
          [SCORING.RESPONSE_FIELDS.DEPLOYMENT_FDE_RELEVANCE]: 1,
          [SCORING.RESPONSE_FIELDS.BUSINESS_OUTCOME_CLARITY]: 1,
          [SCORING.RESPONSE_FIELDS.TECHNICAL_IMPLEMENTATION_USEFULNESS]: 1,
          [SCORING.RESPONSE_FIELDS.RECENCY]: 1,
          [SCORING.RESPONSE_FIELDS.NON_GENERIC_INSIGHT]: 1,
          [SCORING.RESPONSE_FIELDS.REJECTED]: false,
          [SCORING.RESPONSE_FIELDS.REJECTION_REASON]: "only when rejected is true",
          [SCORING.RESPONSE_FIELDS.REASON]: "short enterprise deployment scoring explanation",
        },
      ],
    }),
    "",
    "Return exactly one score object for every candidate id. Preserve the input ids exactly.",
  ].join("\n");
}

export function calculateFinalScore(
  score: ScoreResponse,
  rubric: Rubric<EnterpriseDailyScore> = enterpriseDailyReadingRubric,
): number {
  return calculateWeightedFinalScore(score, rubric.weights);
}

export function parseItemScore(raw: string): ItemScore {
  const parsed = ScoreResponseSchema.safeParse(parseJson(raw));
  if (!parsed.success) {
    throw new Error(`${SCORING.ERRORS.INVALID_SCORE} ${parsed.error.message}`);
  }

  return {
    ...parsed.data,
    finalScore: calculateFinalScore(parsed.data),
  };
}

function toItemScore(
  score: ScoreResponse,
  rubric: Rubric<EnterpriseDailyScore> = enterpriseDailyReadingRubric,
): ItemScore {
  return {
    ...score,
    finalScore: calculateFinalScore(score, rubric),
  };
}

export function parseItemScores(raw: string, expectedIds: readonly string[]): ItemScore[] {
  const parsed = scoreBatchResponseSchema(expectedIds).safeParse(parseJson(raw));
  if (!parsed.success) {
    throw new Error(`${SCORING.ERRORS.INVALID_SCORE} ${parsed.error.message}`);
  }

  return toItemScores(parsed.data, expectedIds);
}

function toItemScores(
  scoreBatch: ScoreBatchResponse,
  expectedIds: readonly string[],
  rubric: Rubric<EnterpriseDailyScore> = enterpriseDailyReadingRubric,
): ItemScore[] {
  const scoresById = new Map<string, ScoreBatchResponse["scores"][number]>();
  for (const score of scoreBatch.scores) {
    scoresById.set(score.id, score);
  }

  return expectedIds.map((id) => {
    const score = scoresById.get(id);
    if (!score) {
      throw new Error(`${SCORING.ERRORS.INVALID_SCORE} Missing score for candidate ${id}.`);
    }

    const { id: _id, ...scoreWithoutId } = score;
    return toItemScore(scoreWithoutId, rubric);
  });
}

export async function scoreItem(
  candidate: CandidateItem,
  preferences: UserPreferences,
  traceOptions: ModelTraceOptions = {},
): Promise<ItemScore> {
  const rubric = traceOptions.rubric ?? enterpriseDailyReadingRubric;
  const { completeFn, rubric: _rubric, ...completeTraceOptions } = traceOptions;
  const messages: ChatMessage[] = [
    {
      role: AGENT.ROLES.SYSTEM,
      content: SCORING.SYSTEM_PROMPT,
    },
    {
      role: AGENT.ROLES.USER,
      content: buildScorePrompt(candidate, preferences, rubric),
    },
  ];

  const result = await completeStructuredWithRepair({
    messages,
    schema: ScoreResponseSchema,
    completeFn: completeFn ?? getDefaultModelClient().complete,
    logger,
    repairInstructions: SCORING.REPAIR_PROMPT,
    completeOptions: {
      temperature: SCORING.MODEL_TEMPERATURE,
      maxOutputTokens: SCORING.MAX_TOKENS,
      ...completeTraceOptions,
      traceLabel: traceOptions.traceLabel ?? "daily.score_item",
      response_format: {
        type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT,
      },
    },
  });
  if (!result.ok) {
    throw new ModelParseError(result.error);
  }

  return toItemScore(result.value, rubric);
}

export async function scoreItems(
  candidates: CandidateItem[],
  preferences: UserPreferences,
  traceOptions: ModelTraceOptions = {},
): Promise<ItemScore[]> {
  if (candidates.length === 0) {
    return [];
  }

  const rubric = traceOptions.rubric ?? enterpriseDailyReadingRubric;
  const { completeFn, rubric: _rubric, ...completeTraceOptions } = traceOptions;
  const expectedIds = candidates.map((candidate) => candidate.id);
  const messages: ChatMessage[] = [
    {
      role: AGENT.ROLES.SYSTEM,
      content: SCORING.SYSTEM_PROMPT,
    },
    {
      role: AGENT.ROLES.USER,
      content: buildBatchScorePrompt(candidates, preferences, rubric),
    },
  ];

  const result = await completeStructuredWithRepair({
    messages,
    schema: scoreBatchResponseSchema(expectedIds),
    completeFn: completeFn ?? getDefaultModelClient().complete,
    logger,
    repairInstructions: SCORING.REPAIR_PROMPT,
    completeOptions: {
      temperature: SCORING.MODEL_TEMPERATURE,
      maxOutputTokens: SCORING.BATCH_MAX_TOKENS,
      ...completeTraceOptions,
      traceLabel: traceOptions.traceLabel ?? "daily.score_items",
      response_format: {
        type: MODEL_PROVIDERS.RESPONSE_FORMATS.JSON_OBJECT,
      },
    },
  });
  if (!result.ok) {
    throw new ModelParseError(result.error);
  }

  return toItemScores(result.value, expectedIds, rubric);
}

function compareScoredCandidates(left: ScoredCandidateItem, right: ScoredCandidateItem): number {
  const scoreOrder = right.score.finalScore - left.score.finalScore;
  if (scoreOrder !== 0) {
    return scoreOrder;
  }

  return left.title.localeCompare(right.title);
}

export function rankScoredCandidates(
  candidates: ScoredCandidateItem[],
  limit: number = SCORING.TOP_RESULTS,
): ScoredCandidateItem[] {
  return [...candidates].sort(compareScoredCandidates).slice(0, limit);
}
