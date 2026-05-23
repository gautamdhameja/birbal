import { searchWeb } from "../../brave-search/client.js";
import { loadSourceRegistry } from "../../config/sourceRegistry.js";
import type { SourceRegistry } from "../../config/sourceRegistry.js";
import { CONTENT_FETCH_STATUSES } from "../../constants/candidates.js";
import { getItemByUrl, getScore, upsertItem, upsertScore } from "../../db/items.js";
import {
  classifyCandidateCategory,
  fallbackCategoryFromScore,
} from "../../daily/classification.js";
import { writeDigest } from "../../daily/digest.js";
import { selectDigestItemsWithTrace } from "../../daily/digestSelection.js";
import { collectDailyCandidateResult } from "../../daily/pipeline.js";
import { scoreItem, scoreItems } from "../../daily/scoring.js";
import type { CandidateItem, ItemScore, ScoredCandidateItem } from "../../daily/types.js";
import { loadPreferences } from "../../memory/preferences.js";
import type { UserPreferences } from "../../memory/types.js";
import { fetchUrlText } from "../../url-text/client.js";
import type { FetchUrlTextResult } from "../../url-text/client.js";
import { extractProductionUseCase } from "../../use-cases/extraction.js";
import type { ProductionUseCaseExtraction } from "../../use-cases/extraction.js";
import { loadProductionUseCaseScoutConfig } from "../../use-cases/config.js";
import { writeUseCaseReport } from "../../use-cases/markdown.js";
import { collectProductionUseCaseCandidates } from "../../use-cases/pipeline.js";
import type { ProductionUseCase, UseCaseSearchCandidate } from "../../use-cases/types.js";
import { pipelineComponentRegistry, PipelineComponentRegistry } from "./registry.js";
import type { PipelineRunItem } from "./runner.js";
import type {
  ArtifactWriter,
  ContentFetcher,
  PipelineCollectionMethod,
  PipelineContext,
  PipelineMetadata,
  Renderer,
  Scorer,
  Selector,
  SourceCollector,
  StructuredExtractor,
} from "./types.js";

const registeredRegistries = new WeakSet<PipelineComponentRegistry>();

function asRunItem(value: unknown): PipelineRunItem {
  return value as PipelineRunItem;
}

function asUseCaseCandidate(value: unknown): UseCaseSearchCandidate {
  return asRunItem(value).item as UseCaseSearchCandidate;
}

function preferencesFromContext(context: PipelineContext): UserPreferences {
  return (context.researchProfile as UserPreferences | null) ?? loadPreferences();
}

function sourceRegistryFromContext(context: PipelineContext): SourceRegistry {
  return (context.sourceRegistry as SourceRegistry | null) ?? loadSourceRegistry();
}

function outputLimit(context: PipelineContext): number | undefined {
  const limit = context.config.limits.limit ?? context.config.limits.maxResults;
  return typeof limit === "number" && Number.isInteger(limit) && limit > 0 ? limit : undefined;
}

function dateString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function renderOutputPath(context: PipelineContext): string {
  const directory = context.config.output.directory ?? ".";
  const filenameTemplate = context.config.output.filenameTemplate ?? `${context.pipelineId}.txt`;
  const filename = filenameTemplate
    .replaceAll("{date}", dateString())
    .replaceAll("{pipelineId}", context.pipelineId)
    .replaceAll("{runId}", context.runId);

  return `${directory}/${filename}`;
}

function selectedRunItemScore(item: PipelineRunItem): ItemScore {
  return item.score as ItemScore;
}

function isCandidateItem(value: unknown): value is CandidateItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "sourceId" in value &&
    "sourceName" in value &&
    "sourceType" in value &&
    "url" in value &&
    "contentFetchStatus" in value
  );
}

function fetchedTextFromCandidate(candidate: CandidateItem): FetchUrlTextResult | null {
  if (
    !candidate.contentText ||
    (candidate.contentFetchStatus !== CONTENT_FETCH_STATUSES.FETCHED &&
      candidate.contentFetchStatus !== CONTENT_FETCH_STATUSES.PAYWALLED)
  ) {
    return null;
  }

  return {
    url: candidate.url,
    title: candidate.title,
    plainText: candidate.contentText,
    detectedPaywall: candidate.contentFetchStatus === CONTENT_FETCH_STATUSES.PAYWALLED,
    contentLength: candidate.contentText.length,
  };
}

function candidateWithFetchedContent(runItem: PipelineRunItem): CandidateItem {
  const candidate = runItem.item as CandidateItem;
  if (
    typeof runItem.content === "object" &&
    runItem.content !== null &&
    "plainText" in runItem.content
  ) {
    const fetched = runItem.content as FetchUrlTextResult;
    return {
      ...candidate,
      title: candidate.title || fetched.title,
      summary: candidate.summary || fetched.plainText,
      contentText: fetched.plainText,
      contentFetchStatus: fetched.detectedPaywall
        ? CONTENT_FETCH_STATUSES.PAYWALLED
        : CONTENT_FETCH_STATUSES.FETCHED,
      raw: {
        item: candidate.raw,
        fetchedText: fetched,
      },
    };
  }

  return candidate;
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
      item.metadata.contentFetchStatus === "fetched"
        ? CONTENT_FETCH_STATUSES.FETCHED
        : candidate.contentFetchStatus,
    category: typeof item.classification === "string" ? item.classification : candidate.category,
  } as CandidateItem;

  return {
    ...enrichedCandidate,
    score,
  };
}

function useCaseQueries(method: PipelineCollectionMethod): readonly string[] {
  const config = loadProductionUseCaseScoutConfig();
  if (method.queries && method.queries.length > 0) {
    return method.queries;
  }

  return method.id === "source_specific_search"
    ? config.sourceSpecificQueries
    : config.dailyQueries;
}

const sourceDomainCollector: SourceCollector = {
  async collect(method, context) {
    const collectionMethod = method as PipelineCollectionMethod;
    if (context.pipelineId === "daily") {
      const preferences = preferencesFromContext(context);
      const result = await collectDailyCandidateResult(sourceRegistryFromContext(context), {
        dailyMix: preferences.dailyMix,
        enableAcademicFallback: preferences.enableAcademicFallback,
      });

      context.logger.info(
        {
          event: "pipeline.daily.sources_used",
          sourcesUsed: result.sourcesUsed,
          sourceErrors: result.errors.length,
        },
        "daily sources selected",
      );

      return result.candidates;
    }

    const config = loadProductionUseCaseScoutConfig();
    const result = await collectProductionUseCaseCandidates(
      config,
      (query, maxResults, freshness) => searchWeb({ query, maxResults, freshness }),
      useCaseQueries(collectionMethod),
    );

    if (result.searchErrors.length > 0) {
      context.logger.warn(
        {
          event: "pipeline.use_cases.search_errors",
          errors: result.searchErrors,
        },
        "use-case search completed with errors",
      );
    }

    return result.candidates;
  },
};

const braveWebSearchCollector: SourceCollector = {
  async collect(method, context) {
    const config = loadProductionUseCaseScoutConfig();
    const result = await collectProductionUseCaseCandidates(
      config,
      (query, maxResults, freshness) => searchWeb({ query, maxResults, freshness }),
      useCaseQueries(method as PipelineCollectionMethod),
    );

    if (result.searchErrors.length > 0) {
      context.logger.warn(
        {
          event: "pipeline.search_errors",
          errors: result.searchErrors,
        },
        "web search completed with errors",
      );
    }

    return result.candidates;
  },
};

const urlTextFetcher: ContentFetcher = {
  async fetch(item) {
    const runItem = asRunItem(item);
    const candidate = runItem.item as { url: string };
    const persistedCandidate = getItemByUrl(candidate.url);
    const cached = persistedCandidate ? fetchedTextFromCandidate(persistedCandidate) : null;
    if (cached) {
      return cached;
    }

    const fetched = await fetchUrlText({ url: candidate.url });
    if (isCandidateItem(runItem.item)) {
      upsertItem({
        ...runItem.item,
        title: runItem.item.title || fetched.title,
        summary: runItem.item.summary || fetched.plainText,
        contentText: fetched.plainText,
        contentFetchStatus: fetched.detectedPaywall
          ? CONTENT_FETCH_STATUSES.PAYWALLED
          : CONTENT_FETCH_STATUSES.FETCHED,
      });
    }

    return fetched;
  },
};

const enterpriseDeploymentScorer: Scorer = {
  async score(item, context) {
    const candidate = candidateWithFetchedContent(asRunItem(item));
    const existingItem = getItemByUrl(candidate.url);

    upsertItem(candidate);
    const persistedItem = getItemByUrl(candidate.url) ?? existingItem ?? candidate;
    const existingScore = getScore(persistedItem.id);
    if (existingScore) {
      return existingScore;
    }

    const score = await scoreItem(candidate, preferencesFromContext(context), {
      traceId: context.runId,
      traceLabel: "pipeline.daily.enterprise_deployment_scorer",
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
      const existingScore = getScore(persistedItem.id);
      if (existingScore) {
        orderedScores[index] = existingScore;
        continue;
      }

      candidatesToScore.push({
        candidate,
        itemId: persistedItem.id,
        outputIndex: index,
      });
    }

    const newScores = await scoreItems(
      candidatesToScore.map(({ candidate }) => candidate),
      preferences,
      {
        traceId: context.runId,
        traceLabel: "pipeline.daily.enterprise_deployment_scorer.batch",
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

const enterpriseDigestClassifier = {
  async classify(item: unknown, context: PipelineContext) {
    const runItem = asRunItem(item);
    const candidate = candidateWithFetchedContent(runItem);
    const score = selectedRunItemScore(runItem);

    try {
      return await classifyCandidateCategory(candidate, score, {
        traceId: context.runId,
        traceLabel: "pipeline.daily.enterprise_digest_classifier",
      });
    } catch {
      return fallbackCategoryFromScore(score);
    }
  },
};

const dailyEnterpriseMixSelector: Selector = {
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

const dailyMarkdownRenderer: Renderer = {
  async render(items) {
    return writeDigest(items as ScoredCandidateItem[], new Date());
  },
};

const productionUseCaseFilter: Scorer = {
  async score(item) {
    const candidate = asUseCaseCandidate(item);

    return {
      publishedAt: candidate.publishedAt,
      sourceName: candidate.sourceName,
    };
  },
};

const productionUseCaseExtractor: StructuredExtractor = {
  async extractStructured(item, context) {
    const runItem = asRunItem(item);
    const candidate = runItem.item as UseCaseSearchCandidate;
    const fetched = runItem.content as Parameters<typeof extractProductionUseCase>[1];

    return extractProductionUseCase(candidate, fetched, {
      traceId: context.runId,
      traceLabel: "pipeline.use_cases.production_use_case_extractor",
    });
  },
};

const productionUseCaseSelector: Selector = {
  async select(items, context) {
    const selected = (items as PipelineRunItem[])
      .map((item) => item.structuredData as ProductionUseCaseExtraction | undefined)
      .filter((item): item is ProductionUseCaseExtraction & { accepted: true } =>
        Boolean(item?.accepted),
      )
      .map(({ accepted: _accepted, ...item }) => item as ProductionUseCase);
    const limit = outputLimit(context);

    return typeof limit === "number" ? selected.slice(0, limit) : selected;
  },
};

const productionUseCaseMarkdownRenderer: Renderer = {
  async render(items) {
    return writeUseCaseReport(items as ProductionUseCase[], new Date());
  },
};

const filesystemArtifactWriter: ArtifactWriter = {
  async write(output, context) {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    const path = renderOutputPath(context);

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, String(output));

    return {
      id: `${context.pipelineId}_artifact`,
      type: context.config.output.format,
      path,
      metadata: context.config.output.metadata as PipelineMetadata | undefined,
    };
  },
};

export function registerDefaultPipelineComponents(
  registry: PipelineComponentRegistry = pipelineComponentRegistry,
): void {
  if (registeredRegistries.has(registry)) {
    return;
  }

  registry.registerMany({
    collectors: {
      brave_web_search_collector: braveWebSearchCollector,
      source_domain_collector: sourceDomainCollector,
    },
    contentFetchers: {
      url_text_fetcher: urlTextFetcher,
    },
    scorers: {
      enterprise_deployment_scorer: enterpriseDeploymentScorer,
      production_use_case_filter: productionUseCaseFilter,
    },
    classifiers: {
      enterprise_digest_classifier: enterpriseDigestClassifier,
    },
    structuredExtractors: {
      production_use_case_extractor: productionUseCaseExtractor,
    },
    selectors: {
      daily_enterprise_mix_selector: dailyEnterpriseMixSelector,
      production_use_case_selector: productionUseCaseSelector,
    },
    renderers: {
      daily_markdown_renderer: dailyMarkdownRenderer,
      production_use_case_markdown_renderer: productionUseCaseMarkdownRenderer,
    },
    artifactWriters: {
      filesystem_artifact_writer: filesystemArtifactWriter,
    },
  });

  registeredRegistries.add(registry);
}
