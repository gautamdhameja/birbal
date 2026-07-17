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
) {
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

export function useCaseSelectorConfigFromContext(context: PipelineContext) {
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

export function useCaseDedupeConfigFromContext(context: PipelineContext): {
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

export function verificationCandidatePoolSize(
  context: PipelineContext,
  targetCount: number,
): number {
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

export function verificationBatchSize(context: PipelineContext, targetCount: number): number {
  const configuredLimit = context.config.limits.verificationBatchSize;
  if (typeof configuredLimit === "number" && Number.isInteger(configuredLimit)) {
    return Math.max(1, configuredLimit);
  }

  return Math.max(1, Math.ceil(targetCount / 2));
}

export function verificationEnabled(context: PipelineContext): boolean {
  const verification = context.config.settings?.verification;
  if (typeof verification !== "object" || verification === null || Array.isArray(verification)) {
    return true;
  }

  return (verification as { enabled?: unknown }).enabled !== false;
}

export function verificationConfigFromContext(context: PipelineContext) {
  return {
    maxLinks: context.config.limits.maxVerificationLinks ?? 2,
    maxChars: context.config.limits.verificationMaxChars ?? 12_000,
    promptLinkedMaxChars: context.config.limits.verificationPromptLinkedMaxChars ?? 1_500,
    promptSourceMaxChars: context.config.limits.verificationPromptSourceMaxChars ?? 5_000,
    minVerificationConfidenceScore: context.config.limits.minVerificationConfidenceScore ?? 3,
  };
}

export function shouldPersistSelectedUseCases(context: PipelineContext): boolean {
  return context.config.metadata?.suppressUseCasePersistence !== true;
}

export function extractionMaxContentChars(context: PipelineContext): number | undefined {
  const value = context.config.limits.extractionMaxContentChars;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

export function extractionSourceEvidenceConfigFromContext(
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
