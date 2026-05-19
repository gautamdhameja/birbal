import { z } from "zod";

import { AGENT, SCORING } from "../constants.js";
import { complete } from "../llama/client.js";
import { parseJson } from "../utils/json.js";
import type { CandidateItem, ItemScore, ReadingPreferences, ScoredCandidateItem } from "./types.js";

const ScoreResponseSchema = z.strictObject({
  [SCORING.RESPONSE_FIELDS.RELEVANCE]: z.number().min(0).max(10),
  [SCORING.RESPONSE_FIELDS.TECHNICAL_DEPTH]: z.number().min(0).max(10),
  [SCORING.RESPONSE_FIELDS.NOVELTY]: z.number().min(0).max(10),
  [SCORING.RESPONSE_FIELDS.PRACTICALITY]: z.number().min(0).max(10),
  [SCORING.RESPONSE_FIELDS.REASON]: z.string().min(1),
});

type ScoreResponse = z.infer<typeof ScoreResponseSchema>;

function normalizePreferences(preferences: ReadingPreferences): string {
  return typeof preferences === "string" ? preferences : preferences.map((item) => `- ${item}`).join("\n");
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

function buildScorePrompt(candidate: CandidateItem, preferences: ReadingPreferences): string {
  return [
    `${SCORING.USER_PROMPT_LABELS.PREFERENCES}:`,
    normalizePreferences(preferences),
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

export async function scoreItem(
  candidate: CandidateItem,
  preferences: ReadingPreferences,
): Promise<ItemScore> {
  const raw = await complete(
    [
      {
        role: AGENT.ROLES.SYSTEM,
        content: SCORING.SYSTEM_PROMPT,
      },
      {
        role: AGENT.ROLES.USER,
        content: buildScorePrompt(candidate, preferences),
      },
    ],
    {
      temperature: SCORING.MODEL_TEMPERATURE,
      max_tokens: SCORING.MAX_TOKENS,
    },
  );

  return parseItemScore(raw);
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
