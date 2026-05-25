import { z } from "zod";

import { AGENT } from "../constants/agent.js";
import { CANDIDATE_CATEGORIES } from "../constants/candidates.js";
import { CLASSIFICATION } from "../constants/classification.js";
import { LLAMA } from "../constants/llama.js";
import { completeStructuredWithRepair, summarizeModelParseError } from "../framework/llm/repair.js";
import type { ChatMessage, CompleteOptions } from "../llama/schema.js";
import { logger } from "../logging/logger.js";
import { parseJson } from "../utils/json.js";
import type { CandidateCategory, CandidateItem, ItemScore } from "./types.js";

const CATEGORY_VALUES = Object.values(CANDIDATE_CATEGORIES) as [
  CandidateCategory,
  ...CandidateCategory[],
];
const NON_REJECTED_CATEGORY_VALUES = CATEGORY_VALUES.filter(
  (category) => category !== CANDIDATE_CATEGORIES.REJECTED,
) as [CandidateCategory, ...CandidateCategory[]];

type ClassificationInput = {
  candidate: CandidateItem;
  score: ItemScore;
};
type ModelTraceOptions = Pick<CompleteOptions, "traceId" | "traceLabel">;

function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, " ").toLocaleLowerCase();
}

function renderClassificationText(candidate: CandidateItem): string {
  return normalizeSearchText(
    [candidate.sourceName, candidate.title, candidate.summary, candidate.contentText ?? ""].join(
      "\n",
    ),
  );
}

function deterministicCategory({
  candidate,
  score,
}: ClassificationInput): CandidateCategory | null {
  if (score.rejected || score.finalScore <= CLASSIFICATION.HARD_REJECT_SCORE_THRESHOLD) {
    return CANDIDATE_CATEGORIES.REJECTED;
  }

  const searchText = renderClassificationText(candidate);
  const matches = Object.entries(CLASSIFICATION.KEYWORD_HINTS)
    .map(([category, keywords]) => ({
      category: category as CandidateCategory,
      count: keywords.filter((keyword) => searchText.includes(keyword)).length,
    }))
    .filter((match) => match.count > 0)
    .sort((left, right) => {
      const countOrder = right.count - left.count;
      return countOrder !== 0 ? countOrder : left.category.localeCompare(right.category);
    });

  if (matches.length === 0 || matches[0]?.count === matches[1]?.count) {
    return null;
  }

  return matches[0]?.category ?? null;
}

function renderCandidateForClassification(candidate: CandidateItem): string {
  return JSON.stringify({
    sourceId: candidate.sourceId,
    sourceName: candidate.sourceName,
    sourceType: candidate.sourceType,
    title: candidate.title,
    url: candidate.url,
    summary: candidate.summary,
    contentText: candidate.contentText,
    publishedAt: candidate.publishedAt,
    contentFetchStatus: candidate.contentFetchStatus,
  });
}

function renderScoreForClassification(score: ItemScore): string {
  return JSON.stringify(score);
}

function allowedCategories(score: ItemScore): [CandidateCategory, ...CandidateCategory[]] {
  return score.rejected ? CATEGORY_VALUES : NON_REJECTED_CATEGORY_VALUES;
}

export function fallbackCategoryFromScore(score: ItemScore): CandidateCategory {
  if (score.rejected || score.finalScore <= CLASSIFICATION.HARD_REJECT_SCORE_THRESHOLD) {
    return CANDIDATE_CATEGORIES.REJECTED;
  }

  const categoryScores: Array<{
    category: Exclude<CandidateCategory, typeof CANDIDATE_CATEGORIES.REJECTED>;
    score: number;
  }> = [
    {
      category: CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE,
      score: (score.enterpriseRelevance + score.realUseCaseSpecificity) / 2,
    },
    {
      category: CANDIDATE_CATEGORIES.WORKFLOW_REDESIGN,
      score: score.workflowRedesignDepth,
    },
    {
      category: CANDIDATE_CATEGORIES.FDE_CUSTOMER_DEPLOYMENT,
      score: score.deploymentFdeRelevance,
    },
    {
      category: CANDIDATE_CATEGORIES.GOVERNANCE_ROI,
      score: score.businessOutcomeClarity,
    },
    {
      category: CANDIDATE_CATEGORIES.AGENTIC_IMPLEMENTATION,
      score: (score.technicalImplementationUsefulness + score.nonGenericInsight) / 2,
    },
  ];

  return (
    categoryScores.sort((left, right) => right.score - left.score)[0]?.category ??
    CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE
  );
}

function buildClassificationPrompt(candidate: CandidateItem, score: ItemScore): string {
  const categories = allowedCategories(score);

  return [
    `${CLASSIFICATION.USER_PROMPT_LABELS.CATEGORIES}:`,
    categories.join(", "),
    "",
    `${CLASSIFICATION.USER_PROMPT_LABELS.CANDIDATE}:`,
    renderCandidateForClassification(candidate),
    "",
    `${CLASSIFICATION.USER_PROMPT_LABELS.SCORE}:`,
    renderScoreForClassification(score),
    "",
    `${CLASSIFICATION.USER_PROMPT_LABELS.RESPONSE_SHAPE}:`,
    JSON.stringify({
      [CLASSIFICATION.RESPONSE_FIELDS.CATEGORY]: CANDIDATE_CATEGORIES.ENTERPRISE_USE_CASE,
    }),
  ].join("\n");
}

export function parseCategoryClassification(
  raw: string,
  categories: [CandidateCategory, ...CandidateCategory[]] = CATEGORY_VALUES,
): CandidateCategory {
  const parsed = categoryClassificationSchema(categories).safeParse(parseJson(raw));
  if (!parsed.success) {
    throw new Error(`${CLASSIFICATION.ERRORS.INVALID_CLASSIFICATION} ${parsed.error.message}`);
  }

  return parsed.data.category;
}

function categoryClassificationSchema(categories: [CandidateCategory, ...CandidateCategory[]]) {
  return z.strictObject({
    [CLASSIFICATION.RESPONSE_FIELDS.CATEGORY]: z.enum(categories),
  });
}

export async function classifyCandidateCategory(
  candidate: CandidateItem,
  score: ItemScore,
  traceOptions: ModelTraceOptions = {},
): Promise<CandidateCategory> {
  const deterministic = deterministicCategory({ candidate, score });
  if (deterministic) {
    return deterministic;
  }

  const messages: ChatMessage[] = [
    {
      role: AGENT.ROLES.SYSTEM,
      content: CLASSIFICATION.SYSTEM_PROMPT,
    },
    {
      role: AGENT.ROLES.USER,
      content: buildClassificationPrompt(candidate, score),
    },
  ];
  const result = await completeStructuredWithRepair({
    messages,
    schema: categoryClassificationSchema(allowedCategories(score)),
    repairInstructions: CLASSIFICATION.REPAIR_PROMPT,
    completeOptions: {
      temperature: CLASSIFICATION.MODEL_TEMPERATURE,
      max_tokens: CLASSIFICATION.MAX_TOKENS,
      ...traceOptions,
      traceLabel: traceOptions.traceLabel ?? "daily.classify_category",
      response_format: {
        type: LLAMA.RESPONSE_FORMATS.JSON_OBJECT,
      },
    },
  });
  if (result.ok) {
    return result.value.category;
  }

  const fallbackCategory = fallbackCategoryFromScore(score);
  logger.warn(
    {
      event: CLASSIFICATION.LOG_EVENTS.FALLBACK_CATEGORY,
      url: candidate.url,
      fallbackCategory,
      error: result.error.message,
      modelParseError: summarizeModelParseError(result.error),
    },
    CLASSIFICATION.LOG_MESSAGES.FALLBACK_CATEGORY,
  );

  return fallbackCategory;
}
