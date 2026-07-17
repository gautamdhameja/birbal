// Purpose: Resolves use-case component configuration and shared transformations.
// Scope: Supports focused collector, extractor, selector, and finalizer modules.

import { CONTENT_FETCH_STATUSES } from "../../../constants/candidates.js";
import type { CandidateItem } from "../../../daily/types.js";
import {
  evidenceHash,
  getCachedUseCaseVerification,
  upsertUseCaseVerificationCache,
  useCaseHash,
} from "../../../db/useCaseModelCache.js";
import { listRecentUseCases } from "../../../db/useCases.js";
import type { PipelineRunItem } from "../../../framework/pipeline/orchestrator.js";
import type {
  PipelineCollectionMethod,
  PipelineContext,
} from "../../../framework/pipeline/types.js";
import { normalizeUrl } from "../../../utils/url.js";
import {
  asRunItem,
  collectionSourceIds,
  fetchedPlainText,
  outputLimit,
  scopedSourceRegistry,
  sourceRegistryFromContext,
} from "../../componentHelpers.js";
import { enterpriseUseCaseFingerprint } from "../dedupe.js";
import { type UseCasePipelineConfig, USE_CASES_PIPELINE_ID } from "../config.js";
import type { EnterpriseUseCase } from "../schema.js";
import type { UseCaseSearchCandidate } from "../search.js";
import { selectEnterpriseUseCases } from "../selector.js";
import {
  ENTERPRISE_USE_CASE_VERIFIER_VERSION,
  type EnterpriseUseCaseVerification,
  type VerificationEvidence,
} from "../verification.js";
import type { SourceEvidence } from "../sourceEvidence.js";

export function asUseCaseCandidate(value: unknown): UseCaseSearchCandidate {
  return asRunItem(value).item as UseCaseSearchCandidate;
}

export function useCaseCandidateToCandidateItem(
  candidate: UseCaseSearchCandidate,
  context: PipelineContext,
): CandidateItem {
  return {
    id: candidate.id,
    sourceId: USE_CASES_PIPELINE_ID,
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

export function useCaseQueries(method: PipelineCollectionMethod): readonly string[] {
  if (!method.queries || method.queries.length === 0) {
    throw new Error("Use-case search collection requires configured queries.");
  }

  return method.queries;
}

export function snapshotIdFromMethod(method: PipelineCollectionMethod): string {
  const snapshotId = method.metadata?.snapshotId;
  return typeof snapshotId === "string" && snapshotId.trim() ? snapshotId.trim() : "latest";
}

export function useCaseScoutConfigFromContext(
  context: PipelineContext,
  method: PipelineCollectionMethod,
  config: UseCasePipelineConfig,
) {
  const sourceRegistry = scopedSourceRegistry(
    sourceRegistryFromContext(context),
    collectionSourceIds(method, context),
  );

  return {
    prioritizedDomains: sourceRegistry.sources.flatMap((source) => source.domains),
    maxSearchQueries: config.limits.maxSearchQueries ?? 1,
    maxSearchResultsPerQuery: config.limits.maxSearchResultsPerQuery ?? 10,
    maxCandidatesForExtraction: config.limits.maxCandidatesForExtraction ?? 30,
    maxCandidateAgeDays: config.limits.maxItemAgeDays,
    referenceDate: context.startedAt,
  };
}

export function useCaseSelectorConfigFromContext(
  context: PipelineContext,
  config: UseCasePipelineConfig,
) {
  const maxUseCasesPerRun = outputLimit(context) ?? config.limits.maxUseCasesPerRun;
  const dedupe = useCaseDedupeConfig(config);

  return {
    allowPreviouslyPublished: dedupe.allowPreviouslyPublished,
    ...(typeof maxUseCasesPerRun === "number" ? { maxUseCasesPerRun } : {}),
    ...(config.limits.minConfidenceScore !== undefined
      ? { minConfidenceScore: config.limits.minConfidenceScore }
      : {}),
    ...(config.limits.maxPerCompany !== undefined
      ? { maxPerCompany: config.limits.maxPerCompany }
      : {}),
    ...(config.limits.maxPerIndustry !== undefined
      ? { maxPerIndustry: config.limits.maxPerIndustry }
      : {}),
    ...(config.limits.maxPerSource !== undefined
      ? { maxPerSource: config.limits.maxPerSource }
      : {}),
    ...(config.limits.maxItemAgeDays !== undefined
      ? { maxUseCaseAgeDays: config.limits.maxItemAgeDays }
      : {}),
    previouslyPublishedFingerprints: dedupe.previouslyPublishedFingerprints,
    referenceDate: context.startedAt,
  };
}

export function useCaseDedupeConfig(config: UseCasePipelineConfig): {
  allowPreviouslyPublished: boolean;
  previouslyPublishedFingerprints: ReadonlySet<string>;
} {
  const dedupeSettings = config.settings?.dedupe ?? {};
  const allowPreviouslyPublished = dedupeSettings.allowPreviouslyPublished === true;
  if (allowPreviouslyPublished) {
    return {
      allowPreviouslyPublished,
      previouslyPublishedFingerprints: new Set<string>(),
    };
  }

  const lookback = dedupeSettings.previouslyPublishedLookback ?? 500;

  return {
    allowPreviouslyPublished,
    previouslyPublishedFingerprints: new Set(
      listRecentUseCases(lookback)
        .map(enterpriseUseCaseFingerprint)
        .filter((fingerprint): fingerprint is string => fingerprint !== null),
    ),
  };
}

export function verificationCandidatePoolSize(
  config: UseCasePipelineConfig,
  targetCount: number,
): number {
  const limits = config.limits;
  const configuredLimit = limits.verificationCandidatePoolSize;
  if (configuredLimit !== undefined) {
    return configuredLimit;
  }

  const multiplier = limits.verificationCandidateMultiplier ?? 3;

  return Math.max(targetCount, Math.ceil(targetCount * multiplier));
}

export function verificationBatchSize(config: UseCasePipelineConfig, targetCount: number): number {
  const configuredLimit = config.limits.verificationBatchSize;
  if (configuredLimit !== undefined) {
    return Math.max(1, configuredLimit);
  }

  return Math.max(1, Math.ceil(targetCount / 2));
}

export function verificationEnabled(config: UseCasePipelineConfig): boolean {
  return config.settings?.verification?.enabled !== false;
}

export function verificationConfig(config: UseCasePipelineConfig) {
  const limits = config.limits;
  return {
    maxLinks: limits.maxVerificationLinks ?? 2,
    maxChars: limits.verificationMaxChars ?? 12_000,
    promptLinkedMaxChars: limits.verificationPromptLinkedMaxChars ?? 1_500,
    promptSourceMaxChars: limits.verificationPromptSourceMaxChars ?? 5_000,
    minVerificationConfidenceScore: limits.minVerificationConfidenceScore ?? 3,
  };
}

export function shouldPersistSelectedUseCases(context: PipelineContext): boolean {
  return context.config.metadata?.suppressUseCasePersistence !== true;
}

export function extractionMaxContentChars(config: UseCasePipelineConfig): number | undefined {
  return config.limits.extractionMaxContentChars;
}

export function extractionSourceEvidenceConfig(
  config: UseCasePipelineConfig,
  candidate: CandidateItem,
  contentText: string,
) {
  return {
    maxLinks: config.limits.extractionMaxSupportingLinks ?? 2,
    maxChars: config.contentFetchPolicy.maxChars,
    fallbackSourceText: contentText,
    fallbackSourceTitle: candidate.title,
    fetchPolicy: {
      maxResponseBytes: config.contentFetchPolicy.maxResponseBytes,
    },
  };
}

export function sourceEvidenceCacheText(sourceEvidence: SourceEvidence): string {
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

export function sourceTextByUrlFromItems(items: readonly PipelineRunItem[]): Map<string, string> {
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

export function cachedVerification(useCase: EnterpriseUseCase, evidence: VerificationEvidence) {
  return getCachedUseCaseVerification({
    evidenceHash: evidenceHash(evidence),
    useCaseHash: useCaseHash(useCase),
    verifierVersion: ENTERPRISE_USE_CASE_VERIFIER_VERSION,
  });
}

export function cacheVerification(
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

export function selectWithoutVerification(
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
