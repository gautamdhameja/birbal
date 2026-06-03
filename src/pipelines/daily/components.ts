// Purpose: Defines Birbal daily reading pipeline components.
// Scope: Keeps daily collectors, scoring, classification, selection, and rendering together.

import { getItemByUrl, upsertItem, upsertScore } from "../../db/items.js";
import {
  classifyCandidateCategory,
  fallbackCategoryFromScore,
} from "../../daily/classification.js";
import { writeDigest } from "../../daily/digest.js";
import { selectDigestItemsWithTrace } from "../../daily/digestSelection.js";
import { collectDailyCandidateResult } from "../../daily/pipeline.js";
import { scoreItem as scoreDailyItem, scoreItems as scoreDailyItems } from "../../daily/scoring.js";
import type { CandidateItem, ItemScore, ScoredCandidateItem } from "../../daily/types.js";
import type { PipelineRunItem } from "../../framework/pipeline/orchestrator.js";
import type {
  Classifier,
  PipelineCollectionMethod,
  PipelineContext,
  Renderer,
  Scorer,
  Selector,
  SourceCollector,
} from "../../framework/pipeline/types.js";
import type { Rubric } from "../../framework/scoring/rubric.js";
import {
  asRunItem,
  candidateWithFetchedContent,
  collectionSourceIds,
  outputLimit,
  preferencesFromContext,
  runDateString,
  scopedSourceRegistry,
  sourceRegistryFromContext,
} from "../componentHelpers.js";
import { enterpriseDailyReadingRubric } from "./rubric.js";
import type { EnterpriseDailyScore } from "./rubric.js";

function enterpriseDailyRubricFromContext(context: PipelineContext): Rubric<EnterpriseDailyScore> {
  return (
    (context.rubric as Rubric<EnterpriseDailyScore> | undefined) ?? enterpriseDailyReadingRubric
  );
}

function selectedRunItemScore(item: PipelineRunItem): ItemScore {
  return item.score as ItemScore;
}

function dailyScoredItemFromRunItem(item: PipelineRunItem): ScoredCandidateItem {
  const candidate = item.item as CandidateItem;
  const score = selectedRunItemScore(item);
  const contentText =
    typeof item.content === "object" && item.content !== null && "plainText" in item.content
      ? String((item.content as { plainText?: unknown }).plainText ?? "")
      : candidate.contentText;
  const enrichedCandidate: CandidateItem = {
    ...candidate,
    contentText,
    contentFetchStatus:
      typeof item.metadata.contentFetchStatus === "string"
        ? item.metadata.contentFetchStatus
        : candidate.contentFetchStatus,
    category: typeof item.classification === "string" ? item.classification : candidate.category,
  } as CandidateItem;

  return {
    ...enrichedCandidate,
    score,
  };
}

export const sourceDomainCollector: SourceCollector = {
  async collect(method, context) {
    const collectionMethod = method as PipelineCollectionMethod;
    if (context.pipelineId !== "daily") {
      throw new Error("source_domain_collector is only implemented for the daily pipeline.");
    }

    const preferences = preferencesFromContext(context);
    const result = await collectDailyCandidateResult(
      scopedSourceRegistry(
        sourceRegistryFromContext(context),
        collectionSourceIds(collectionMethod, context),
      ),
      {
        dailyMix: preferences.dailyMix,
        enableAcademicFallback: preferences.enableAcademicFallback,
      },
    );

    context.logger.info(
      {
        event: "pipeline.daily.sources_used",
        sourcesUsed: result.sourcesUsed,
        sourceErrors: result.errors.length,
      },
      "daily sources selected",
    );

    return {
      items: result.candidates,
      errors: result.errors.map((error) => ({
        message: error.error,
        sourceId: error.source,
        code: "source_collection_failed",
        metadata: {
          source: error.source,
          topic: error.topic,
          status: error.status,
        },
      })),
    };
  },
};

export const enterpriseDeploymentScorer: Scorer = {
  async score(item, context) {
    const candidate = candidateWithFetchedContent(asRunItem(item));
    const existingItem = getItemByUrl(candidate.url);

    upsertItem(candidate);
    const persistedItem = getItemByUrl(candidate.url) ?? existingItem ?? candidate;

    const score = await scoreDailyItem(candidate, preferencesFromContext(context), {
      traceId: context.runId,
      traceLabel: "pipeline.daily.enterprise_deployment_scorer",
      rubric: enterpriseDailyRubricFromContext(context),
      completeFn: context.modelClient.complete,
    });
    upsertScore(persistedItem.id, score);

    return score;
  },
  async scoreBatch(items, context) {
    const preferences = preferencesFromContext(context);
    const orderedScores = new Array<ItemScore>(items.length);
    const candidatesToScore: Array<{
      candidate: CandidateItem;
      itemId: string;
      outputIndex: number;
    }> = [];

    for (const [index, item] of items.entries()) {
      const candidate = candidateWithFetchedContent(asRunItem(item));
      const existingItem = getItemByUrl(candidate.url);

      upsertItem(candidate);
      const persistedItem = getItemByUrl(candidate.url) ?? existingItem ?? candidate;

      candidatesToScore.push({
        candidate,
        itemId: persistedItem.id,
        outputIndex: index,
      });
    }

    const newScores = await scoreDailyItems(
      candidatesToScore.map(({ candidate }) => candidate),
      preferences,
      {
        traceId: context.runId,
        traceLabel: "pipeline.daily.enterprise_deployment_scorer.batch",
        rubric: enterpriseDailyRubricFromContext(context),
        completeFn: context.modelClient.complete,
      },
    );
    for (const [index, score] of newScores.entries()) {
      const candidateToScore = candidatesToScore[index];
      if (!candidateToScore) {
        continue;
      }

      upsertScore(candidateToScore.itemId, score);
      orderedScores[candidateToScore.outputIndex] = score;
    }

    return orderedScores;
  },
};

export const enterpriseDigestClassifier: Classifier = {
  async classify(item: unknown, context: PipelineContext) {
    const runItem = asRunItem(item);
    const candidate = candidateWithFetchedContent(runItem);
    const score = selectedRunItemScore(runItem);

    try {
      return await classifyCandidateCategory(candidate, score, {
        traceId: context.runId,
        traceLabel: "pipeline.daily.enterprise_digest_classifier",
        completeFn: context.modelClient.complete,
      });
    } catch {
      return fallbackCategoryFromScore(score);
    }
  },
};

export const dailyEnterpriseMixSelector: Selector = {
  async select(items, context) {
    const scoredItems = (items as PipelineRunItem[]).map(dailyScoredItemFromRunItem);
    for (const item of scoredItems) {
      upsertItem(item);
    }

    const { selectedItems, trace } = selectDigestItemsWithTrace(
      scoredItems,
      preferencesFromContext(context),
    );
    const limit = outputLimit(context);

    context.logger.info(
      {
        event: "pipeline.daily.selection",
        counts: trace.counts,
        selected: trace.selected,
      },
      "daily digest selection complete",
    );

    return typeof limit === "number" ? selectedItems.slice(0, limit) : selectedItems;
  },
};

export const dailyMarkdownRenderer: Renderer = {
  async render(items, context) {
    return writeDigest(items as ScoredCandidateItem[], runDateString(context));
  },
};

export const dailyPipelineComponents = {
  collectors: {
    source_domain_collector: sourceDomainCollector,
  },
  scorers: {
    enterprise_deployment_scorer: enterpriseDeploymentScorer,
  },
  classifiers: {
    enterprise_digest_classifier: enterpriseDigestClassifier,
  },
  selectors: {
    daily_enterprise_mix_selector: dailyEnterpriseMixSelector,
  },
  renderers: {
    daily_markdown_renderer: dailyMarkdownRenderer,
  },
  rubrics: {
    [enterpriseDailyReadingRubric.id]: enterpriseDailyReadingRubric,
  },
} as const;
