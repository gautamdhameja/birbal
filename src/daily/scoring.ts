import { z } from "zod";

import { AGENT } from "../constants/agent.js";
import { LLAMA } from "../constants/llama.js";
import { SCORING } from "../constants/scoring.js";
import { complete } from "../llama/client.js";
import type { ChatMessage, CompleteOptions } from "../llama/schema.js";
import type { UserPreferences } from "../memory/types.js";
import { parseJson } from "../utils/json.js";
import type { CandidateItem, ItemScore, ScoredCandidateItem } from "./types.js";

const ScoreResponseSchema = z
  .strictObject({
    [SCORING.RESPONSE_FIELDS.ENTERPRISE_RELEVANCE]: z.number().min(1).max(5),
    [SCORING.RESPONSE_FIELDS.WORKFLOW_REDESIGN_DEPTH]: z.number().min(1).max(5),
    [SCORING.RESPONSE_FIELDS.REAL_USE_CASE_SPECIFICITY]: z.number().min(1).max(5),
    [SCORING.RESPONSE_FIELDS.DEPLOYMENT_FDE_RELEVANCE]: z.number().min(1).max(5),
    [SCORING.RESPONSE_FIELDS.BUSINESS_OUTCOME_CLARITY]: z.number().min(1).max(5),
    [SCORING.RESPONSE_FIELDS.TECHNICAL_IMPLEMENTATION_USEFULNESS]: z.number().min(1).max(5),
    [SCORING.RESPONSE_FIELDS.RECENCY]: z.number().min(1).max(5),
    [SCORING.RESPONSE_FIELDS.NON_GENERIC_INSIGHT]: z.number().min(1).max(5),
    [SCORING.RESPONSE_FIELDS.REJECTED]: z.boolean(),
    [SCORING.RESPONSE_FIELDS.REJECTION_REASON]: z.string().min(1).optional(),
    [SCORING.RESPONSE_FIELDS.REASON]: z.string().min(1),
  })
  .refine((score) => !score.rejected || Boolean(score.rejectionReason), {
    message: "rejectionReason is required when rejected is true.",
    path: [SCORING.RESPONSE_FIELDS.REJECTION_REASON],
  });

type ScoreResponse = z.infer<typeof ScoreResponseSchema>;
type ModelTraceOptions = Pick<CompleteOptions, "traceId" | "traceLabel">;
const ScoreBatchResponseSchema = z.strictObject({
  scores: z.array(
    ScoreResponseSchema.extend({
      id: z.string().min(1),
    }),
  ),
});

type ScoreBatchResponse = z.infer<typeof ScoreBatchResponseSchema>;

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

function buildScorePrompt(candidate: CandidateItem, preferences: UserPreferences): string {
  return [
    renderPreferencesForScoring(preferences),
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
): string {
  return [
    renderPreferencesForScoring(preferences),
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

export function calculateFinalScore(score: ScoreResponse): number {
  if (score.rejected) {
    return 0;
  }

  return (
    SCORING.WEIGHTS.ENTERPRISE_RELEVANCE * score.enterpriseRelevance +
    SCORING.WEIGHTS.WORKFLOW_REDESIGN_DEPTH * score.workflowRedesignDepth +
    SCORING.WEIGHTS.REAL_USE_CASE_SPECIFICITY * score.realUseCaseSpecificity +
    SCORING.WEIGHTS.DEPLOYMENT_FDE_RELEVANCE * score.deploymentFdeRelevance +
    SCORING.WEIGHTS.BUSINESS_OUTCOME_CLARITY * score.businessOutcomeClarity +
    SCORING.WEIGHTS.TECHNICAL_IMPLEMENTATION_USEFULNESS * score.technicalImplementationUsefulness +
    SCORING.WEIGHTS.RECENCY * score.recency +
    SCORING.WEIGHTS.NON_GENERIC_INSIGHT * score.nonGenericInsight
  );
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

function toItemScore(score: ScoreResponse): ItemScore {
  return {
    ...score,
    finalScore: calculateFinalScore(score),
  };
}

export function parseItemScores(raw: string, expectedIds: readonly string[]): ItemScore[] {
  const parsed = ScoreBatchResponseSchema.safeParse(parseJson(raw));
  if (!parsed.success) {
    throw new Error(`${SCORING.ERRORS.INVALID_SCORE} ${parsed.error.message}`);
  }

  const scoresById = new Map<string, ScoreBatchResponse["scores"][number]>();
  for (const score of parsed.data.scores) {
    scoresById.set(score.id, score);
  }

  return expectedIds.map((id) => {
    const score = scoresById.get(id);
    if (!score) {
      throw new Error(`${SCORING.ERRORS.INVALID_SCORE} Missing score for candidate ${id}.`);
    }

    const { id: _id, ...scoreWithoutId } = score;
    return toItemScore(scoreWithoutId);
  });
}

export async function scoreItem(
  candidate: CandidateItem,
  preferences: UserPreferences,
  traceOptions: ModelTraceOptions = {},
): Promise<ItemScore> {
  const messages: ChatMessage[] = [
    {
      role: AGENT.ROLES.SYSTEM,
      content: SCORING.SYSTEM_PROMPT,
    },
    {
      role: AGENT.ROLES.USER,
      content: buildScorePrompt(candidate, preferences),
    },
  ];

  let lastError: unknown;

  for (let attempt = 1; attempt <= SCORING.MAX_ATTEMPTS; attempt += 1) {
    const raw = await complete(messages, {
      temperature: SCORING.MODEL_TEMPERATURE,
      max_tokens: SCORING.MAX_TOKENS,
      ...traceOptions,
      traceLabel: traceOptions.traceLabel ?? "daily.score_item",
      response_format: {
        type: LLAMA.RESPONSE_FORMATS.JSON_OBJECT,
      },
    });

    try {
      return parseItemScore(raw);
    } catch (error) {
      lastError = error;
      messages.push(
        {
          role: AGENT.ROLES.ASSISTANT,
          content: raw,
        },
        {
          role: AGENT.ROLES.USER,
          content: SCORING.REPAIR_PROMPT,
        },
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function scoreItems(
  candidates: CandidateItem[],
  preferences: UserPreferences,
  traceOptions: ModelTraceOptions = {},
): Promise<ItemScore[]> {
  if (candidates.length === 0) {
    return [];
  }

  const expectedIds = candidates.map((candidate) => candidate.id);
  const messages: ChatMessage[] = [
    {
      role: AGENT.ROLES.SYSTEM,
      content: SCORING.SYSTEM_PROMPT,
    },
    {
      role: AGENT.ROLES.USER,
      content: buildBatchScorePrompt(candidates, preferences),
    },
  ];

  let lastError: unknown;

  for (let attempt = 1; attempt <= SCORING.MAX_ATTEMPTS; attempt += 1) {
    const raw = await complete(messages, {
      temperature: SCORING.MODEL_TEMPERATURE,
      max_tokens: SCORING.BATCH_MAX_TOKENS,
      ...traceOptions,
      traceLabel: traceOptions.traceLabel ?? "daily.score_items",
      response_format: {
        type: LLAMA.RESPONSE_FORMATS.JSON_OBJECT,
      },
    });

    try {
      return parseItemScores(raw, expectedIds);
    } catch (error) {
      lastError = error;
      messages.push(
        {
          role: AGENT.ROLES.ASSISTANT,
          content: raw,
        },
        {
          role: AGENT.ROLES.USER,
          content: SCORING.REPAIR_PROMPT,
        },
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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
