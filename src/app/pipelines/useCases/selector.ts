import {
  EnterpriseUseCaseSchema,
  hasNamedEnterpriseCompany,
  isEligibleEnterpriseUseCase,
  type EnterpriseUseCase,
} from "./schema.js";
import { enterpriseUseCaseCompanyKey, enterpriseUseCaseFingerprint } from "./dedupe.js";
import { isWithinAgeWindow } from "./freshness.js";

export type EnterpriseUseCaseSelectorConfig = {
  allowPreviouslyPublished?: boolean;
  maxUseCasesPerRun?: number;
  minConfidenceScore?: number;
  maxPerCompany?: number;
  maxPerIndustry?: number;
  maxPerSource?: number;
  maxUseCaseAgeDays?: number;
  previouslyPublishedFingerprints?: ReadonlySet<string>;
  referenceDate?: Date;
};

const DEFAULT_SELECTOR_CONFIG = {
  allowPreviouslyPublished: false,
  maxUseCasesPerRun: 10,
  minConfidenceScore: 3,
  maxPerCompany: 1,
  maxPerIndustry: 3,
  maxPerSource: 3,
} as const;

function resolvedConfig(config: EnterpriseUseCaseSelectorConfig = {}) {
  return {
    ...DEFAULT_SELECTOR_CONFIG,
    referenceDate: new Date(),
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

function rankedUseCases<TUseCase extends EnterpriseUseCase>(
  useCases: readonly TUseCase[],
): TUseCase[] {
  return [...useCases].sort((left, right) => {
    const namedCompanyDifference =
      Number(hasNamedEnterpriseCompany(right)) - Number(hasNamedEnterpriseCompany(left));
    if (namedCompanyDifference !== 0) {
      return namedCompanyDifference;
    }

    const confidenceDifference = right.confidenceScore - left.confidenceScore;
    if (confidenceDifference !== 0) {
      return confidenceDifference;
    }

    return `${left.companyName}:${left.aiSystemOrCapability}`.localeCompare(
      `${right.companyName}:${right.aiSystemOrCapability}`,
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
  return selectEnterpriseUseCaseItems(useCases, config);
}

export function selectEnterpriseUseCaseItems<TUseCase extends EnterpriseUseCase>(
  useCases: readonly TUseCase[],
  config: EnterpriseUseCaseSelectorConfig = {},
): TUseCase[] {
  const selectionConfig = resolvedConfig(config);
  const candidates = rankedUseCases(
    useCases.filter((useCase) => {
      const parsed = EnterpriseUseCaseSchema.safeParse(useCase);
      return (
        parsed.success &&
        isEligibleEnterpriseUseCase(parsed.data) &&
        (selectionConfig.allowPreviouslyPublished ||
          !isPreviouslyPublished(parsed.data, selectionConfig.previouslyPublishedFingerprints)) &&
        parsed.data.confidenceScore >= selectionConfig.minConfidenceScore &&
        isWithinAgeWindow({
          maxAgeDays: selectionConfig.maxUseCaseAgeDays,
          publishedAt: parsed.data.publishDate,
          referenceDate: selectionConfig.referenceDate,
        })
      );
    }),
  );
  const selected: TUseCase[] = [];
  const companyCounts = new Map<string, number>();
  const industryCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const selectedFingerprints = new Set<string>();

  for (const useCase of candidates) {
    if (selected.length >= selectionConfig.maxUseCasesPerRun) {
      break;
    }

    const industry = normalize(useCase.industry);
    if (countFor(industryCounts, industry) >= selectionConfig.maxPerIndustry) {
      continue;
    }

    const company = enterpriseUseCaseCompanyKey(useCase);
    if (company && countFor(companyCounts, company) >= selectionConfig.maxPerCompany) {
      continue;
    }

    const source = sourceKey(useCase);
    if (countFor(sourceCounts, source) >= selectionConfig.maxPerSource) {
      continue;
    }

    const fingerprint = enterpriseUseCaseFingerprint(useCase);
    if (fingerprint && selectedFingerprints.has(fingerprint)) {
      continue;
    }

    selected.push(useCase);
    if (company) {
      increment(companyCounts, company);
    }
    increment(industryCounts, industry);
    increment(sourceCounts, source);
    if (fingerprint) {
      selectedFingerprints.add(fingerprint);
    }
  }

  return selected;
}

function isPreviouslyPublished(
  useCase: EnterpriseUseCase,
  previouslyPublishedFingerprints: ReadonlySet<string> | undefined,
): boolean {
  const fingerprint = enterpriseUseCaseFingerprint(useCase);

  return fingerprint !== null && previouslyPublishedFingerprints?.has(fingerprint) === true;
}
