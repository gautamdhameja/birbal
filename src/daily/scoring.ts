import { z } from "zod";

import { AGENT } from "../constants/agent.js";
import { LLAMA } from "../constants/llama.js";
import { SCORING } from "../constants/scoring.js";
import { complete } from "../llama/client.js";
import type { ChatMessage } from "../llama/schema.js";
import type { UserPreferences } from "../memory/types.js";
import { parseJson } from "../utils/json.js";
import type { CandidateItem, ItemScore, ScoredCandidateItem } from "./types.js";

const ScoreResponseSchema = z.strictObject({
  [SCORING.RESPONSE_FIELDS.RELEVANCE]: z.number().min(0).max(10),
  [SCORING.RESPONSE_FIELDS.TECHNICAL_DEPTH]: z.number().min(0).max(10),
  [SCORING.RESPONSE_FIELDS.NOVELTY]: z.number().min(0).max(10),
  [SCORING.RESPONSE_FIELDS.PRACTICALITY]: z.number().min(0).max(10),
  [SCORING.RESPONSE_FIELDS.REASON]: z.string().min(1),
});

type ScoreResponse = z.infer<typeof ScoreResponseSchema>;

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
    source: candidate.source,
    title: candidate.title,
    url: candidate.url,
    summary: candidate.summary,
    publishedAt: candidate.publishedAt,
  });
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
      [SCORING.RESPONSE_FIELDS.RELEVANCE]: 0,
      [SCORING.RESPONSE_FIELDS.TECHNICAL_DEPTH]: 0,
      [SCORING.RESPONSE_FIELDS.NOVELTY]: 0,
      [SCORING.RESPONSE_FIELDS.PRACTICALITY]: 0,
      [SCORING.RESPONSE_FIELDS.REASON]: "short explanation",
    }),
  ].join("\n");
}

export function calculateFinalScore(score: ScoreResponse): number {
  return (
    SCORING.WEIGHTS.RELEVANCE * score.relevance +
    SCORING.WEIGHTS.TECHNICAL_DEPTH * score.technical_depth +
    SCORING.WEIGHTS.PRACTICALITY * score.practicality +
    SCORING.WEIGHTS.NOVELTY * score.novelty
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

function candidateSearchText(candidate: CandidateItem): string {
  return [candidate.title, candidate.url, candidate.summary]
    .join("\n")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesAvoidTerm(searchText: string, avoidTerm: string): boolean {
  const normalizedTerm = avoidTerm.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  if (!normalizedTerm) {
    return false;
  }

  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(normalizedTerm)}($|[^\\p{L}\\p{N}])`,
    "u",
  ).test(searchText);
}

function findAvoidTerm(candidate: CandidateItem, avoidTerms: readonly string[]): string | null {
  const searchText = candidateSearchText(candidate);

  return avoidTerms.find((term) => matchesAvoidTerm(searchText, term)) ?? null;
}

export function applyAvoidPenalty(
  candidate: CandidateItem,
  preferences: UserPreferences,
  score: ItemScore,
): ItemScore {
  const avoidTerm = findAvoidTerm(candidate, preferences.avoid);
  if (!avoidTerm) {
    return score;
  }

  const penalizedScore = {
    ...score,
    relevance: Math.min(score.relevance, SCORING.AVOID_MATCH_RELEVANCE_CAP),
    reason: `${score.reason} ${SCORING.AVOID_REASON_PREFIX}: ${avoidTerm}.`,
  };

  return {
    ...penalizedScore,
    finalScore: calculateFinalScore(penalizedScore),
  };
}

export async function scoreItem(
  candidate: CandidateItem,
  preferences: UserPreferences,
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
      response_format: {
        type: LLAMA.RESPONSE_FORMATS.JSON_OBJECT,
      },
    });

    try {
      return applyAvoidPenalty(candidate, preferences, parseItemScore(raw));
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
