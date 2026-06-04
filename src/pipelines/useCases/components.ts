// Purpose: Defines Birbal enterprise use-case pipeline components.
// Scope: Keeps use-case search, extraction, selection, and Markdown rendering together.

import { searchWeb } from "../../brave-search/client.js";
import { CONTENT_FETCH_STATUSES } from "../../constants/candidates.js";
import type { CandidateItem } from "../../daily/types.js";
import {
  getLatestSearchSnapshot,
  getSearchSnapshot,
  listSearchSnapshotItems,
} from "../../db/searchSnapshots.js";
import { upsertUseCase } from "../../db/useCases.js";
import type { PipelineRunItem } from "../../framework/pipeline/orchestrator.js";
import { selectWithAcceptanceBackfill } from "../../framework/pipeline/selection.js";
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
import { collectUseCaseSearchCandidates, searchSnapshotItemToCandidate } from "./search.js";
import type { UseCaseSearchCandidate } from "./search.js";
import type { EnterpriseUseCase } from "./schema.js";
import { selectEnterpriseUseCaseItems, selectEnterpriseUseCases } from "./selector.js";
import { verifySelectedEnterpriseUseCases } from "./verification.js";
import { normalizeUrl } from "../../utils/url.js";

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

function snapshotIdFromMethod(method: PipelineCollectionMethod): string {
  const snapshotId = method.metadata?.snapshotId;
  return typeof snapshotId === "string" && snapshotId.trim() ? snapshotId.trim() : "latest";
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
  const maxUseCasesPerRun = outputLimit(context) ?? context.config.limits.maxUseCasesPerRun;

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

function verificationCandidatePoolSize(context: PipelineContext, targetCount: number): number {
  const configuredLimit = context.config.limits.verificationCandidatePoolSize;
  if (typeof configuredLimit === "number") {
    return configuredLimit;
  }

  const multiplier =
    typeof context.config.limits.verificationCandidateMultiplier === "number"
      ? context.config.limits.verificationCandidateMultiplier
      : 3;

  return Math.max(targetCount, Math.ceil(targetCount * multiplier));
}

function verificationEnabled(context: PipelineContext): boolean {
  const verification = context.config.settings?.verification;
  if (typeof verification !== "object" || verification === null || Array.isArray(verification)) {
    return true;
  }

  return (verification as { enabled?: unknown }).enabled !== false;
}

function verificationConfigFromContext(context: PipelineContext) {
  return {
    maxLinks: context.config.limits.maxVerificationLinks ?? 2,
    maxChars: context.config.limits.verificationMaxChars ?? 12_000,
    minVerificationConfidenceScore: context.config.limits.minVerificationConfidenceScore ?? 3,
  };
}

function sourceTextByUrlFromItems(items: readonly PipelineRunItem[]): Map<string, string> {
  const sourceTextByUrl = new Map<string, string>();
  for (const item of items) {
    const candidate = asUseCaseCandidate(item);
    const plainText = fetchedPlainText(item);
    if (plainText.trim()) {
      sourceTextByUrl.set(normalizeUrl(candidate.url), plainText);
    }
  }

  return sourceTextByUrl;
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

export const searchSnapshotCollector: SourceCollector = {
  async collect(method, context) {
    const collectionMethod = method as PipelineCollectionMethod;
    const requestedSnapshotId = snapshotIdFromMethod(collectionMethod);
    const snapshot =
      requestedSnapshotId === "latest"
        ? getLatestSearchSnapshot(context.pipelineId)
        : getSearchSnapshot(requestedSnapshotId);

    if (!snapshot) {
      throw new Error(`Search snapshot not found: ${requestedSnapshotId}`);
    }

    if (snapshot.pipelineId !== context.pipelineId) {
      throw new Error(
        `Search snapshot ${snapshot.id} belongs to ${snapshot.pipelineId}, not ${context.pipelineId}.`,
      );
    }

    const candidates = listSearchSnapshotItems(snapshot.id).map(searchSnapshotItemToCandidate);
    context.logger.info(
      {
        event: "pipeline.use_cases.search_snapshot_loaded",
        snapshotId: snapshot.id,
        candidateCount: candidates.length,
      },
      "use-case search snapshot loaded",
    );

    return candidates;
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
        completeFn: context.modelClient.complete,
      },
    );
  },
};

export const enterpriseUseCaseSelector: Selector = {
  async select(items, context) {
    const runItems = items as PipelineRunItem[];
    const extractedUseCases = runItems.flatMap((item) =>
      Array.isArray(item.structuredData) ? (item.structuredData as EnterpriseUseCase[]) : [],
    );
    const selectorConfig = useCaseSelectorConfigFromContext(context);
    const targetCount = selectorConfig.maxUseCasesPerRun ?? 10;
    const verified = verificationEnabled(context)
      ? await selectWithAcceptanceBackfill({
          candidates: extractedUseCases,
          candidatePoolSize: verificationCandidatePoolSize(context, targetCount),
          targetCount,
          selectCandidates: (candidates, limit) =>
            selectEnterpriseUseCases(candidates, {
              ...selectorConfig,
              maxUseCasesPerRun: limit,
            }),
          acceptCandidates: (candidates) =>
            verifySelectedEnterpriseUseCases(candidates, {
              ...verificationConfigFromContext(context),
              sourceTextByUrl: sourceTextByUrlFromItems(runItems),
              traceId: context.runId,
              traceLabel: "pipeline.use_cases.enterprise_use_case_verifier",
              completeFn: context.modelClient.complete,
            }),
          selectAccepted: (candidates, limit) =>
            selectEnterpriseUseCaseItems(candidates, {
              ...selectorConfig,
              maxUseCasesPerRun: limit,
            }),
        })
      : {
          candidatePool: selectEnterpriseUseCases(extractedUseCases, selectorConfig),
          acceptedPool: selectEnterpriseUseCases(extractedUseCases, selectorConfig),
          selected: selectEnterpriseUseCases(extractedUseCases, selectorConfig).map((useCase) => ({
            ...useCase,
            verification: {
              verified: true,
              confidenceScore: useCase.confidenceScore,
              unsupportedFields: [],
              evidenceLinks: [],
              notes: "Verification disabled by pipeline config.",
            },
          })),
        };

    context.logger.info(
      {
        event: "pipeline.use_cases.verification",
        selectedBeforeVerification: verified.candidatePool.length,
        verifiedBeforeFinalSelection: verified.acceptedPool.length,
        verified: verified.selected.length,
        rejectedByVerification: verified.candidatePool.length - verified.acceptedPool.length,
      },
      "use-case verification completed",
    );

    for (const useCase of verified.selected) {
      upsertUseCase({
        ...useCase,
        runId: context.runId,
        rawJson: {
          useCase,
          verification: useCase.verification,
        },
      });
    }

    return verified.selected;
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
    search_snapshot_collector: searchSnapshotCollector,
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
