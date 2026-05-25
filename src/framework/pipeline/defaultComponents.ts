import {
  closeSync,
  constants as fsConstants,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { searchWeb } from "../../brave-search/client.js";
import { loadSourceRegistry } from "../../config/sourceRegistry.js";
import type { SourceRegistry } from "../../config/sourceRegistry.js";
import { CONTENT_FETCH_STATUSES } from "../../constants/candidates.js";
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
import { upsertUseCase } from "../../db/useCases.js";
import { fetchUrlContent } from "../content/fetchUrl.js";
import type { FetchUrlContentResult } from "../content/fetchUrl.js";
import { loadPreferences } from "../../memory/preferences.js";
import type { UserPreferences } from "../../memory/types.js";
import { extractEnterpriseUseCases } from "../../pipelines/useCases/extractor.js";
import { renderEnterpriseUseCaseDigest } from "../../pipelines/useCases/renderer.js";
import {
  collectUseCaseSearchCandidates,
  type UseCaseSearchCandidate,
} from "../../pipelines/useCases/search.js";
import { enterpriseDailyReadingRubric } from "../../pipelines/daily/rubric.js";
import type { EnterpriseDailyScore } from "../../pipelines/daily/rubric.js";
import type { EnterpriseUseCase } from "../../pipelines/useCases/schema.js";
import { selectEnterpriseUseCases } from "../../pipelines/useCases/selector.js";
import { formatDateOnlyInTimeZone } from "../../utils/date.js";
import type { Rubric } from "../scoring/rubric.js";
import type { PipelineComponentRegistry } from "./registry.js";
import { pipelineComponentRegistry } from "./registry.js";
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

function useCaseCandidateToCandidateItem(
  candidate: UseCaseSearchCandidate,
  context: PipelineContext,
): CandidateItem {
  return {
    id: candidate.id,
    sourceId: "use_cases",
    sourceName: candidate.sourceName ?? "unknown",
    sourceType: "community",
    title: candidate.title,
    url: candidate.url,
    summary: candidate.description,
    publishedAt: candidate.publishedAt,
    discoveredAt: context.startedAt.toISOString(),
    contentFetchStatus: CONTENT_FETCH_STATUSES.FETCHED,
    raw: candidate.raw,
  };
}

function fetchedPlainText(item: PipelineRunItem): string {
  if (
    typeof item.content === "object" &&
    item.content !== null &&
    "plainText" in item.content &&
    typeof item.content.plainText === "string"
  ) {
    return item.content.plainText;
  }

  return "";
}

function preferencesFromContext(context: PipelineContext): UserPreferences {
  return (context.researchProfile as UserPreferences | null) ?? loadPreferences();
}

function sourceRegistryFromContext(context: PipelineContext): SourceRegistry {
  return (context.sourceRegistry as SourceRegistry | null) ?? loadSourceRegistry();
}

function scopedSourceRegistry(
  sourceRegistry: SourceRegistry,
  sourceIds: readonly string[],
): SourceRegistry {
  if (sourceIds.length === 0) {
    return sourceRegistry;
  }

  const allowedSourceIds = new Set(sourceIds);
  return {
    sources: sourceRegistry.sources.filter((source) => allowedSourceIds.has(source.id)),
  };
}

function collectionSourceIds(method: PipelineCollectionMethod, context: PipelineContext): string[] {
  return method.sourceIds ?? context.config.sourceIds;
}

function enterpriseDailyRubricFromContext(context: PipelineContext): Rubric<EnterpriseDailyScore> {
  return (
    (context.rubric as Rubric<EnterpriseDailyScore> | undefined) ?? enterpriseDailyReadingRubric
  );
}

function outputLimit(context: PipelineContext): number | undefined {
  const limit = context.config.limits.limit ?? context.config.limits.maxResults;
  return typeof limit === "number" && Number.isInteger(limit) && limit > 0 ? limit : undefined;
}

function runDateString(context: PipelineContext): string {
  return formatDateOnlyInTimeZone(context.startedAt, context.config.schedule?.timezone);
}

function renderOutputPath(context: PipelineContext): string {
  const directory = context.config.output.directory ?? ".";
  const filenameTemplate = context.config.output.filenameTemplate ?? `${context.pipelineId}.txt`;
  const filename = filenameTemplate
    .replaceAll("{date}", runDateString(context))
    .replaceAll("{pipelineId}", context.pipelineId)
    .replaceAll("{runId}", context.runId);
  const unsafeParts = [directory, filename].flatMap((part) => part.split(/[\\/]+/));
  if (isAbsolute(directory) || isAbsolute(filename) || unsafeParts.includes("..")) {
    throw new Error("Pipeline output path must stay inside the workspace.");
  }

  const artifactRoot = resolve(process.cwd());
  const outputPath = resolve(artifactRoot, join(directory, filename));
  const relativeOutputPath = relative(artifactRoot, outputPath);
  if (relativeOutputPath.startsWith("..") || isAbsolute(relativeOutputPath)) {
    throw new Error("Pipeline output path must stay inside the workspace.");
  }

  return outputPath;
}

function assertOutputPathResolvesInsideWorkspace(outputPath: string): void {
  const realWorkspaceRoot = realpathSync(process.cwd());
  const realParentDirectory = realpathSync(dirname(outputPath));
  const relativeParent = relative(realWorkspaceRoot, realParentDirectory);
  if (relativeParent.startsWith("..") || isAbsolute(relativeParent)) {
    throw new Error("Pipeline output path must not resolve outside the workspace.");
  }

  try {
    if (lstatSync(outputPath).isSymbolicLink()) {
      throw new Error("Pipeline output file must not be a symlink.");
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
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

function fetchedTextFromCandidate(candidate: CandidateItem): FetchUrlContentResult | null {
  if (
    !candidate.contentText ||
    (candidate.contentFetchStatus !== CONTENT_FETCH_STATUSES.FETCHED &&
      candidate.contentFetchStatus !== CONTENT_FETCH_STATUSES.PAYWALLED)
  ) {
    return null;
  }

  return {
    url: candidate.url,
    contentType: "",
    title: candidate.title,
    plainText: candidate.contentText,
    contentLength: candidate.contentText.length,
    fetchStatus: candidate.contentFetchStatus,
  };
}

function candidateWithFetchedContent(runItem: PipelineRunItem): CandidateItem {
  const candidate = runItem.item as CandidateItem;
  if (
    typeof runItem.content === "object" &&
    runItem.content !== null &&
    "plainText" in runItem.content
  ) {
    const fetched = runItem.content as FetchUrlContentResult;
    return {
      ...candidate,
      title: candidate.title || fetched.title,
      summary: candidate.summary || fetched.plainText,
      contentText: fetched.plainText,
      contentFetchStatus: fetched.fetchStatus,
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

function useCaseQueries(method: PipelineCollectionMethod): readonly string[] {
  if (!method.queries || method.queries.length === 0) {
    throw new Error("Use-case search collection requires configured queries.");
  }

  return method.queries;
}

function useCaseScoutConfigFromContext(context: PipelineContext, method: PipelineCollectionMethod) {
  const sourceRegistry = scopedSourceRegistry(
    sourceRegistryFromContext(context),
    collectionSourceIds(method, context),
  );

  return {
    prioritizedDomains: sourceRegistry.sources.flatMap((source) => source.domains),
    maxSearchQueries: context.config.limits.maxSearchQueries ?? 1,
    maxSearchResultsPerQuery: context.config.limits.maxSearchResultsPerQuery ?? 10,
    maxCandidatesForExtraction: context.config.limits.maxCandidatesForExtraction ?? 30,
  };
}

const sourceDomainCollector: SourceCollector = {
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

const braveWebSearchCollector: SourceCollector = {
  async collect(method, context) {
    const collectionMethod = method as PipelineCollectionMethod;
    const config = useCaseScoutConfigFromContext(context, collectionMethod);
    const queries = useCaseQueries(collectionMethod);
    const result = await collectUseCaseSearchCandidates(
      config,
      (query, maxResults, freshness) => searchWeb({ query, maxResults, freshness }),
      queries,
    );

    context.logger.info(
      {
        event: "pipeline.use_cases.search_queries",
        collectorId: collectionMethod.collectorId,
        methodId: collectionMethod.id,
        configuredQueryCount: queries.length,
        searchedQueryCount: result.searchedQueries,
      },
      "use-case search queries selected",
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

    return {
      items: result.candidates,
      errors: result.searchErrors.map((error) => ({
        message: error.error,
        stepId: collectionMethod.id,
        code: "source_collection_failed",
        metadata: {
          query: error.query,
          collectorId: collectionMethod.collectorId,
        },
      })),
    };
  },
};

const urlTextFetcher: ContentFetcher = {
  async fetch(item, context) {
    const runItem = asRunItem(item);
    const candidate = runItem.item as { url: string };
    const persistedCandidate = getItemByUrl(candidate.url);
    const cached = persistedCandidate ? fetchedTextFromCandidate(persistedCandidate) : null;
    if (cached) {
      return cached;
    }

    const fetched = await fetchUrlContent({
      url: candidate.url,
      maxChars: context.config.contentFetchPolicy.maxChars,
    });
    if (isCandidateItem(runItem.item) && fetched.fetchStatus !== CONTENT_FETCH_STATUSES.FAILED) {
      upsertItem({
        ...runItem.item,
        title: runItem.item.title || fetched.title,
        summary: runItem.item.summary || fetched.plainText,
        contentText: fetched.plainText,
        contentFetchStatus: fetched.fetchStatus,
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

    const score = await scoreDailyItem(candidate, preferencesFromContext(context), {
      traceId: context.runId,
      traceLabel: "pipeline.daily.enterprise_deployment_scorer",
      rubric: enterpriseDailyRubricFromContext(context),
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
  async render(items, context) {
    return writeDigest(items as ScoredCandidateItem[], runDateString(context));
  },
};

const enterpriseUseCaseExtractor: StructuredExtractor = {
  async extractStructured(item, context) {
    const runItem = asRunItem(item);
    const contentText = fetchedPlainText(runItem);
    if (!contentText.trim()) {
      return [];
    }

    return extractEnterpriseUseCases(
      useCaseCandidateToCandidateItem(asUseCaseCandidate(item), context),
      contentText,
      {
        traceId: context.runId,
        traceLabel: "pipeline.use_cases.enterprise_use_case_extractor",
      },
    );
  },
};

function useCaseSelectorConfigFromContext(context: PipelineContext) {
  const maxUseCasesPerRun = context.config.limits.maxUseCasesPerRun ?? outputLimit(context);

  return {
    ...(typeof maxUseCasesPerRun === "number" ? { maxUseCasesPerRun } : {}),
    ...(typeof context.config.limits.minConfidenceScore === "number"
      ? { minConfidenceScore: context.config.limits.minConfidenceScore }
      : {}),
    ...(typeof context.config.limits.maxPerIndustry === "number"
      ? { maxPerIndustry: context.config.limits.maxPerIndustry }
      : {}),
    ...(typeof context.config.limits.maxPerSource === "number"
      ? { maxPerSource: context.config.limits.maxPerSource }
      : {}),
  };
}

const enterpriseUseCaseSelector: Selector = {
  async select(items, context) {
    const extractedUseCases = (items as PipelineRunItem[]).flatMap((item) =>
      Array.isArray(item.structuredData) ? (item.structuredData as EnterpriseUseCase[]) : [],
    );
    const selected = selectEnterpriseUseCases(
      extractedUseCases,
      useCaseSelectorConfigFromContext(context),
    );

    for (const useCase of selected) {
      upsertUseCase({
        ...useCase,
        runId: context.runId,
        rawJson: {
          useCase,
        },
      });
    }

    return selected;
  },
};

const enterpriseUseCaseMarkdownRenderer: Renderer = {
  async render(items, context) {
    return renderEnterpriseUseCaseDigest(items as EnterpriseUseCase[], runDateString(context));
  },
};

const filesystemArtifactWriter: ArtifactWriter = {
  async write(output, context) {
    const path = renderOutputPath(context);
    const fileHandle = { fd: -1 };

    mkdirSync(dirname(path), { recursive: true });
    assertOutputPathResolvesInsideWorkspace(path);
    fileHandle.fd = openSync(
      path,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_TRUNC |
        (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      writeFileSync(fileHandle.fd, String(output));
    } finally {
      closeSync(fileHandle.fd);
    }

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
    },
    classifiers: {
      enterprise_digest_classifier: enterpriseDigestClassifier,
    },
    structuredExtractors: {
      enterprise_use_case_extractor: enterpriseUseCaseExtractor,
    },
    selectors: {
      daily_enterprise_mix_selector: dailyEnterpriseMixSelector,
      enterprise_use_case_selector: enterpriseUseCaseSelector,
    },
    renderers: {
      daily_markdown_renderer: dailyMarkdownRenderer,
      enterprise_use_case_markdown_renderer: enterpriseUseCaseMarkdownRenderer,
    },
    artifactWriters: {
      filesystem_artifact_writer: filesystemArtifactWriter,
    },
    rubrics: {
      [enterpriseDailyReadingRubric.id]: enterpriseDailyReadingRubric,
    },
  });

  registeredRegistries.add(registry);
}
