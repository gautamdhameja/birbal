// Purpose: Implements the Birbal pipeline component: selector.
// Scope: Keeps app-specific pipeline behavior outside the generic framework.

import { EnterpriseUseCaseSchema, type EnterpriseUseCase } from "./schema.js";

export type EnterpriseUseCaseSelectorConfig = {
  maxUseCasesPerRun?: number;
  minConfidenceScore?: number;
  maxPerIndustry?: number;
  maxPerSource?: number;
};

const DEFAULT_SELECTOR_CONFIG = {
  maxUseCasesPerRun: 10,
  minConfidenceScore: 3,
  maxPerIndustry: 3,
  maxPerSource: 3,
} as const;

function resolvedConfig(config: EnterpriseUseCaseSelectorConfig = {}) {
  return {
    ...DEFAULT_SELECTOR_CONFIG,
    ...config,
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function sourceHost(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function sourceKey(useCase: EnterpriseUseCase): string {
  return normalize(useCase.sourceName) !== "unknown"
    ? normalize(useCase.sourceName)
    : sourceHost(useCase.sourceUrl);
}

function similarityKey(useCase: EnterpriseUseCase): string {
  return [
    normalize(useCase.businessFunction),
    normalize(useCase.workflowAffected),
    normalize(useCase.aiSystemOrCapability),
  ].join("|");
}

function rankedUseCases(useCases: readonly EnterpriseUseCase[]): EnterpriseUseCase[] {
  return [...useCases].sort((left, right) => {
    const confidenceDifference = right.confidenceScore - left.confidenceScore;
    if (confidenceDifference !== 0) {
      return confidenceDifference;
    }

    return `${left.companyName}:${left.workflowAffected}`.localeCompare(
      `${right.companyName}:${right.workflowAffected}`,
    );
  });
}

function countFor(map: Map<string, number>, key: string): number {
  return map.get(key) ?? 0;
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, countFor(map, key) + 1);
}

export function selectEnterpriseUseCases(
  useCases: readonly EnterpriseUseCase[],
  config: EnterpriseUseCaseSelectorConfig = {},
): EnterpriseUseCase[] {
  const selectionConfig = resolvedConfig(config);
  const candidates = rankedUseCases(
    useCases
      .map((useCase) => EnterpriseUseCaseSchema.parse(useCase))
      .filter((useCase) => useCase.confidenceScore >= selectionConfig.minConfidenceScore),
  );
  const selected: EnterpriseUseCase[] = [];
  const industryCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const selectedSimilarityKeys = new Set<string>();

  for (const useCase of candidates) {
    if (selected.length >= selectionConfig.maxUseCasesPerRun) {
      break;
    }

    const industry = normalize(useCase.industry);
    if (countFor(industryCounts, industry) >= selectionConfig.maxPerIndustry) {
      continue;
    }

    const source = sourceKey(useCase);
    if (countFor(sourceCounts, source) >= selectionConfig.maxPerSource) {
      continue;
    }

    const similarKey = similarityKey(useCase);
    if (selectedSimilarityKeys.has(similarKey)) {
      continue;
    }

    selected.push(useCase);
    increment(industryCounts, industry);
    increment(sourceCounts, source);
    selectedSimilarityKeys.add(similarKey);
  }

  return selected;
}
