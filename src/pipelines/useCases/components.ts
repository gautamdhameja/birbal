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
import {
  contentHash,
  evidenceHash,
  getCachedUseCaseExtraction,
  getCachedUseCaseVerification,
  upsertUseCaseExtractionCache,
  upsertUseCaseVerificationCache,
  useCaseHash,
} from "../../db/useCaseModelCache.js";
import { listRecentUseCases, upsertUseCase } from "../../db/useCases.js";
import type { PipelineRunItem } from "../../framework/pipeline/orchestrator.js";
import { selectWithIncrementalAcceptance } from "../../framework/pipeline/selection.js";
import type {
  PipelineCollectionMethod,
  PipelineContext,
  PipelineFinalizer,
  Renderer,
  Selector,
  SourceCollector,
  StructuredExtractor,
} from "../../framework/pipeline/types.js";
import { normalizeUrl } from "../../utils/url.js";
import {
  asRunItem,
  collectionSourceIds,
  fetchedPlainText,
  outputLimit,
  runDateString,
  scopedSourceRegistry,
  sourceRegistryFromContext,
} from "../componentHelpers.js";
import { ENTERPRISE_USE_CASE_EXTRACTOR_VERSION, extractEnterpriseUseCases } from "./extractor.js";
import { renderEnterpriseUseCaseDigest } from "./renderer.js";
import {
  collectUseCaseSearchCandidates,
  isRecentUseCaseSearchCandidate,
  searchSnapshotItemToCandidate,
} from "./search.js";
import type { UseCaseSearchCandidate } from "./search.js";
import { enterpriseUseCaseFingerprint } from "./dedupe.js";
import type { EnterpriseUseCase } from "./schema.js";
import { selectEnterpriseUseCaseItems, selectEnterpriseUseCases } from "./selector.js";
import {
  ENTERPRISE_USE_CASE_VERIFIER_VERSION,
  verifySelectedEnterpriseUseCases,
  type EnterpriseUseCaseVerification,
  type VerificationEvidence,
  type VerifiedEnterpriseUseCase,
} from "./verification.js";
import { fetchSourceEvidence, type SourceEvidence } from "./sourceEvidence.js";

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
    maxCandidateAgeDays: context.config.limits.maxItemAgeDays,
    referenceDate: context.startedAt,
  };
}

function useCaseSelectorConfigFromContext(context: PipelineContext) {
  const maxUseCasesPerRun = outputLimit(context) ?? context.config.limits.maxUseCasesPerRun;
  const dedupe = useCaseDedupeConfigFromContext(context);

  return {
    allowPreviouslyPublished: dedupe.allowPreviouslyPublished,
    ...(typeof maxUseCasesPerRun === "number" ? { maxUseCasesPerRun } : {}),
    ...(typeof context.config.limits.minConfidenceScore === "number"
      ? { minConfidenceScore: context.config.limits.minConfidenceScore }
      : {}),
    ...(typeof context.config.limits.maxPerCompany === "number"
      ? { maxPerCompany: context.config.limits.maxPerCompany }
      : {}),
    ...(typeof context.config.limits.maxPerIndustry === "number"
      ? { maxPerIndustry: context.config.limits.maxPerIndustry }
      : {}),
    ...(typeof context.config.limits.maxPerSource === "number"
      ? { maxPerSource: context.config.limits.maxPerSource }
      : {}),
    ...(typeof context.config.limits.maxItemAgeDays === "number"
      ? { maxUseCaseAgeDays: context.config.limits.maxItemAgeDays }
      : {}),
    previouslyPublishedFingerprints: dedupe.previouslyPublishedFingerprints,
    referenceDate: context.startedAt,
  };
}

function useCaseDedupeConfigFromContext(context: PipelineContext): {
  allowPreviouslyPublished: boolean;
  previouslyPublishedFingerprints: ReadonlySet<string>;
} {
  const dedupe = context.config.settings?.dedupe;
  const dedupeSettings =
    typeof dedupe === "object" && dedupe !== null && !Array.isArray(dedupe)
      ? (dedupe as { allowPreviouslyPublished?: unknown; previouslyPublishedLookback?: unknown })
      : {};
  const allowPreviouslyPublished = dedupeSettings.allowPreviouslyPublished === true;
  if (allowPreviouslyPublished) {
    return {
      allowPreviouslyPublished,
      previouslyPublishedFingerprints: new Set<string>(),
    };
  }

  const lookback =
    typeof dedupeSettings.previouslyPublishedLookback === "number" &&
    Number.isInteger(dedupeSettings.previouslyPublishedLookback) &&
    dedupeSettings.previouslyPublishedLookback > 0
      ? dedupeSettings.previouslyPublishedLookback
      : 500;

  return {
    allowPreviouslyPublished,
    previouslyPublishedFingerprints: new Set(
      listRecentUseCases(lookback)
        .map(enterpriseUseCaseFingerprint)
        .filter((fingerprint): fingerprint is string => fingerprint !== null),
    ),
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

function verificationBatchSize(context: PipelineContext, targetCount: number): number {
  const configuredLimit = context.config.limits.verificationBatchSize;
  if (typeof configuredLimit === "number" && Number.isInteger(configuredLimit)) {
    return Math.max(1, configuredLimit);
  }

  return Math.max(1, Math.ceil(targetCount / 2));
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
    promptLinkedMaxChars: context.config.limits.verificationPromptLinkedMaxChars ?? 1_500,
    promptSourceMaxChars: context.config.limits.verificationPromptSourceMaxChars ?? 5_000,
    minVerificationConfidenceScore: context.config.limits.minVerificationConfidenceScore ?? 3,
  };
}

function shouldPersistSelectedUseCases(context: PipelineContext): boolean {
  return context.config.metadata?.suppressUseCasePersistence !== true;
}

function extractionMaxContentChars(context: PipelineContext): number | undefined {
  const value = context.config.limits.extractionMaxContentChars;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function extractionSourceEvidenceConfigFromContext(
  context: PipelineContext,
  candidate: CandidateItem,
  contentText: string,
) {
  return {
    maxLinks: context.config.limits.extractionMaxSupportingLinks ?? 2,
    maxChars: context.config.contentFetchPolicy.maxChars,
    fallbackSourceText: contentText,
    fallbackSourceTitle: candidate.title,
    fetchPolicy: {
      maxResponseBytes: context.config.contentFetchPolicy.maxResponseBytes,
    },
  };
}

function sourceEvidenceCacheText(sourceEvidence: SourceEvidence): string {
  return JSON.stringify({
    source: {
      url: sourceEvidence.source.url,
      title: sourceEvidence.source.title,
      plainText: sourceEvidence.source.plainText,
    },
    linkedEvidence: sourceEvidence.linkedEvidence.map((document) => ({
      url: document.url,
      title: document.title,
      plainText: document.plainText,
    })),
  });
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

function cachedVerification(useCase: EnterpriseUseCase, evidence: VerificationEvidence) {
  return getCachedUseCaseVerification({
    evidenceHash: evidenceHash(evidence),
    useCaseHash: useCaseHash(useCase),
    verifierVersion: ENTERPRISE_USE_CASE_VERIFIER_VERSION,
  });
}

function cacheVerification(
  useCase: EnterpriseUseCase,
  evidence: VerificationEvidence,
  verification: EnterpriseUseCaseVerification,
): void {
  upsertUseCaseVerificationCache({
    evidenceHash: evidenceHash(evidence),
    useCaseHash: useCaseHash(useCase),
    verification,
    verifierVersion: ENTERPRISE_USE_CASE_VERIFIER_VERSION,
  });
}

function selectWithoutVerification(
  extractedUseCases: readonly EnterpriseUseCase[],
  selectorConfig: ReturnType<typeof useCaseSelectorConfigFromContext>,
) {
  const selectedUseCases = selectEnterpriseUseCases(extractedUseCases, selectorConfig);

  return {
    candidatePool: selectedUseCases,
    acceptedPool: selectedUseCases,
    processedCandidateCount: 0,
    selected: selectedUseCases.map((useCase) => ({
      ...useCase,
      verification: {
        verified: true,
        confidenceScore: useCase.confidenceScore,
        evidenceLinks: [],
        notes: "Verification disabled by pipeline config.",
      },
    })),
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

    const candidates = listSearchSnapshotItems(snapshot.id)
      .map(searchSnapshotItemToCandidate)
      .filter((candidate) =>
        isRecentUseCaseSearchCandidate(candidate, {
          maxCandidateAgeDays: context.config.limits.maxItemAgeDays,
          referenceDate: context.startedAt,
        }),
      );
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

    const candidate = useCaseCandidateToCandidateItem(asUseCaseCandidate(item), context);
    const sourceEvidence = await fetchSourceEvidence(
      candidate.url,
      extractionSourceEvidenceConfigFromContext(context, candidate, contentText),
    );
    context.logger.debug(
      {
        event: "pipeline.use_cases.extraction_evidence",
        sourceUrl: candidate.url,
        linkedEvidenceCount: sourceEvidence.linkedEvidence.length,
        linkedEvidenceUrls: sourceEvidence.linkedEvidence.map((document) => document.url),
      },
      "use-case extraction evidence prepared",
    );

    const hashedContent = contentHash(sourceEvidenceCacheText(sourceEvidence));
    const cached = getCachedUseCaseExtraction({
      contentHash: hashedContent,
      extractorVersion: ENTERPRISE_USE_CASE_EXTRACTOR_VERSION,
      sourceUrl: candidate.url,
    });
    if (cached) {
      context.logger.debug(
        {
          event: "pipeline.use_cases.extraction_cache_hit",
          sourceUrl: candidate.url,
          useCaseCount: cached.length,
        },
        "use-case extraction cache hit",
      );
      return cached;
    }

    const useCases = await extractEnterpriseUseCases(candidate, contentText, {
      traceId: context.runId,
      traceLabel: "pipeline.use_cases.enterprise_use_case_extractor",
      completeFn: context.modelClient.complete,
      maxContentChars: extractionMaxContentChars(context),
      sourceEvidence,
    });

    upsertUseCaseExtractionCache({
      contentHash: hashedContent,
      extractorVersion: ENTERPRISE_USE_CASE_EXTRACTOR_VERSION,
      sourceUrl: candidate.url,
      useCases,
    });

    return useCases;
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
      ? await selectWithIncrementalAcceptance({
          candidates: extractedUseCases,
          batchSize: verificationBatchSize(context, targetCount),
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
              getCachedVerification: cachedVerification,
              upsertVerificationCache: cacheVerification,
            }),
          selectAccepted: (candidates, limit) =>
            selectEnterpriseUseCaseItems(candidates, {
              ...selectorConfig,
              maxUseCasesPerRun: limit,
            }),
        })
      : selectWithoutVerification(extractedUseCases, selectorConfig);

    context.logger.info(
      {
        event: "pipeline.use_cases.verification",
        extractedUseCases: extractedUseCases.length,
        selectedBeforeVerification: verified.candidatePool.length,
        verifiedBeforeFinalSelection: verified.acceptedPool.length,
        verified: verified.selected.length,
        rejectedByVerification: verified.candidatePool.length - verified.acceptedPool.length,
        processedForVerification: verified.processedCandidateCount,
      },
      "use-case verification completed",
    );

    return verified.selected;
  },
};

export const enterpriseUseCaseFinalizer: PipelineFinalizer = {
  async finalize(items, _artifact, context) {
    if (!shouldPersistSelectedUseCases(context)) {
      return;
    }

    for (const useCase of items as VerifiedEnterpriseUseCase[]) {
      upsertUseCase({
        ...useCase,
        runId: context.runId,
        rawJson: {
          useCase,
          verification: useCase.verification,
        },
      });
    }
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
  finalizers: {
    enterprise_use_case_finalizer: enterpriseUseCaseFinalizer,
  },
} as const;
