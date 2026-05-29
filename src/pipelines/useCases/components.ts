// Purpose: Defines Birbal enterprise use-case pipeline components.
// Scope: Keeps use-case search, extraction, selection, and Markdown rendering together.

import { searchWeb } from "../../brave-search/client.js";
import { CONTENT_FETCH_STATUSES } from "../../constants/candidates.js";
import type { CandidateItem } from "../../daily/types.js";
import { upsertUseCase } from "../../db/useCases.js";
import type { PipelineRunItem } from "../../framework/pipeline/orchestrator.js";
import type {
  PipelineCollectionMethod,
  PipelineContext,
  Renderer,
  Selector,
  SourceCollector,
  StructuredExtractor,
} from "../../framework/pipeline/types.js";
import {
  asRunItem,
  collectionSourceIds,
  fetchedPlainText,
  outputLimit,
  runDateString,
  scopedSourceRegistry,
  sourceRegistryFromContext,
} from "../componentHelpers.js";
import { extractEnterpriseUseCases } from "./extractor.js";
import { renderEnterpriseUseCaseDigest } from "./renderer.js";
import { collectUseCaseSearchCandidates } from "./search.js";
import type { UseCaseSearchCandidate } from "./search.js";
import type { EnterpriseUseCase } from "./schema.js";
import { selectEnterpriseUseCases } from "./selector.js";

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

export const braveWebSearchCollector: SourceCollector = {
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

export const enterpriseUseCaseExtractor: StructuredExtractor = {
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

export const enterpriseUseCaseSelector: Selector = {
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

export const enterpriseUseCaseMarkdownRenderer: Renderer = {
  async render(items, context) {
    return renderEnterpriseUseCaseDigest(items as EnterpriseUseCase[], runDateString(context));
  },
};

export const useCasePipelineComponents = {
  collectors: {
    brave_web_search_collector: braveWebSearchCollector,
  },
  structuredExtractors: {
    enterprise_use_case_extractor: enterpriseUseCaseExtractor,
  },
  selectors: {
    enterprise_use_case_selector: enterpriseUseCaseSelector,
  },
  renderers: {
    enterprise_use_case_markdown_renderer: enterpriseUseCaseMarkdownRenderer,
  },
} as const;
