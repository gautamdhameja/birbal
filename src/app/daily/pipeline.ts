// Purpose: Implements the daily reading pipeline support: pipeline.
// Scope: Contains Birbal-specific digest scoring, classification, and rendering helpers.

import { searchArxiv } from "../arxiv/client.js";
import type { ArxivPaper } from "../arxiv/client.js";
import type { SourceRegistry, SourceRegistryItem } from "../config/sourceRegistry.js";
import { DAILY_READING } from "../constants/daily.js";
import { SOURCES } from "../constants/sources.js";
import { SOURCE_REGISTRY } from "../constants/source-registry.js";
import { searchHackerNews } from "../hackernews/client.js";
import type { HackerNewsStory } from "../hackernews/client.js";
import { mapLimit } from "../../framework/pipeline/concurrency.js";
import { isHttpStatusError } from "../http/client.js";
import type { UserPreferences } from "../memory/types.js";
import { searchSourceDomain } from "../source-search/domain.js";
import { normalizeUrl } from "../utils/url.js";
import { CONTENT_FETCH_STATUSES } from "./types.js";
import type { CandidateItem } from "./types.js";

export type DailyCollectionError = {
  source: string;
  topic: string;
  error: string;
  status?: number;
};

export type DailyCollectionResult = {
  candidates: CandidateItem[];
  errors: DailyCollectionError[];
  sourcesUsed: string[];
};

type SourceCollectionResult = {
  candidates: CandidateItem[];
  error?: DailyCollectionError;
};

type SourceCollector = {
  sourceId: string;
  collect(topic: string, sourceConfig: SourceRegistryItem): Promise<CandidateItem[]>;
};

type DailyMix = UserPreferences["dailyMix"];

type DailyCollectionOptions = {
  dailyMix?: DailyMix;
  enableAcademicFallback?: boolean;
};

export { normalizeUrl };
const SOURCE_COLLECTION_CONCURRENCY = 3;

function defaultDiscoveredAt(): string {
  return new Date().toISOString();
}

function createBaseCandidate(
  sourceConfig: SourceRegistryItem,
  url: string,
): Pick<
  CandidateItem,
  "sourceId" | "sourceName" | "sourceType" | "url" | "discoveredAt" | "contentFetchStatus"
> {
  return {
    sourceId: sourceConfig.id,
    sourceName: sourceConfig.name,
    sourceType: sourceConfig.sourceType,
    url,
    discoveredAt: defaultDiscoveredAt(),
    contentFetchStatus: CONTENT_FETCH_STATUSES.NOT_FETCHED,
  };
}

export function toArxivCandidate(
  paper: ArxivPaper,
  sourceConfig: SourceRegistryItem = {
    id: SOURCES.ARXIV,
    name: "arXiv",
    domains: ["arxiv.org"],
    priority: 1,
    sourceType: SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC_FALLBACK,
    searchQueries: ["LLM agents"],
    enabled: true,
  },
): CandidateItem {
  const url = normalizeUrl(paper.url);

  return {
    id: `${SOURCES.ARXIV}:${url}`,
    ...createBaseCandidate(sourceConfig, url),
    title: paper.title,
    summary: paper.summary,
    publishedAt: paper.published,
    raw: paper,
  };
}

export function toHackerNewsCandidate(
  story: HackerNewsStory,
  sourceConfig: SourceRegistryItem = {
    id: SOURCES.HACKER_NEWS,
    name: "Hacker News",
    domains: ["news.ycombinator.com"],
    priority: 1,
    sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
    searchQueries: ["LLM agents"],
    enabled: true,
  },
): CandidateItem {
  const url = normalizeUrl(story.url);

  return {
    id: `${SOURCES.HACKER_NEWS}:${url}`,
    ...createBaseCandidate(sourceConfig, url),
    title: story.title,
    summary: "",
    publishedAt: story.created_at,
    raw: story,
  };
}

function dedupeByUrl(candidates: CandidateItem[]): CandidateItem[] {
  const seen = new Set<string>();
  const deduped: CandidateItem[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.url)) {
      continue;
    }

    seen.add(candidate.url);
    deduped.push(candidate);
  }

  return deduped;
}

function toTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compareCandidates(left: CandidateItem, right: CandidateItem): number {
  const publishedOrder = toTimestamp(right.publishedAt) - toTimestamp(left.publishedAt);
  if (publishedOrder !== 0) {
    return publishedOrder;
  }

  const sourceOrder = left.sourceId.localeCompare(right.sourceId);
  if (sourceOrder !== 0) {
    return sourceOrder;
  }

  return left.title.localeCompare(right.title);
}

export function rankDailyCandidates(
  candidates: CandidateItem[],
  maxCandidates: number = DAILY_READING.MAX_CANDIDATES,
  dailyMix?: DailyMix,
): CandidateItem[] {
  const rankedCandidates = dedupeByUrl([...candidates].sort(compareCandidates));
  if (!dailyMix) {
    return rankedCandidates.slice(0, maxCandidates);
  }

  return applyDailyMix(rankedCandidates, maxCandidates, dailyMix);
}

function calculateSourceQuotas(maxCandidates: number, dailyMix: DailyMix): Map<string, number> {
  const weightedSources = Object.entries(dailyMix)
    .map(([source, weight]) => ({
      source,
      weight,
    }))
    .filter(({ weight }) => weight > 0);

  const totalWeight = weightedSources.reduce((sum, { weight }) => sum + weight, 0);
  if (totalWeight <= 0) {
    return new Map();
  }

  const quotas = new Map<string, number>();
  const quotaParts = weightedSources.map(({ source, weight }) => {
    const exactQuota = (weight / totalWeight) * maxCandidates;
    const baseQuota = Math.floor(exactQuota);
    quotas.set(source, baseQuota);

    return {
      source,
      remainder: exactQuota - baseQuota,
    };
  });

  let remainingSlots = maxCandidates - [...quotas.values()].reduce((sum, quota) => sum + quota, 0);
  for (const { source } of quotaParts.sort((left, right) => {
    const remainderOrder = right.remainder - left.remainder;
    return remainderOrder !== 0 ? remainderOrder : left.source.localeCompare(right.source);
  })) {
    if (remainingSlots <= 0) {
      break;
    }

    quotas.set(source, (quotas.get(source) ?? 0) + 1);
    remainingSlots -= 1;
  }

  return quotas;
}

function applyDailyMix(
  rankedCandidates: CandidateItem[],
  maxCandidates: number,
  dailyMix: DailyMix,
): CandidateItem[] {
  const quotas = calculateSourceQuotas(maxCandidates, dailyMix);
  const allowedSources = new Set(quotas.keys());
  const selectedIds = new Set<string>();
  const selectedCandidates: CandidateItem[] = [];

  for (const [source, quota] of quotas) {
    const sourceCandidates = rankedCandidates.filter((candidate) => candidate.sourceId === source);
    for (const candidate of sourceCandidates.slice(0, quota)) {
      selectedIds.add(candidate.id);
      selectedCandidates.push(candidate);
    }
  }

  for (const candidate of rankedCandidates) {
    if (selectedCandidates.length >= maxCandidates) {
      break;
    }

    if (!allowedSources.has(candidate.sourceId) || selectedIds.has(candidate.id)) {
      continue;
    }

    selectedIds.add(candidate.id);
    selectedCandidates.push(candidate);
  }

  return selectedCandidates.sort(compareCandidates);
}

function isRateLimitError(error: DailyCollectionError): boolean {
  return error.status === DAILY_READING.RATE_LIMIT_STATUS;
}

async function collectFromSource(
  sourceCollector: SourceCollector,
  topic: string,
  sourceConfig: SourceRegistryItem,
): Promise<SourceCollectionResult> {
  try {
    return { candidates: await sourceCollector.collect(topic, sourceConfig) };
  } catch (error) {
    return {
      candidates: [],
      error: {
        source: sourceCollector.sourceId,
        topic,
        error: error instanceof Error ? error.message : String(error),
        status: isHttpStatusError(error) ? error.status : undefined,
      },
    };
  }
}

const ACADEMIC_FALLBACK_COLLECTOR = {
  sourceId: SOURCES.ARXIV,
  async collect(topic: string, sourceConfig: SourceRegistryItem) {
    const results = await searchArxiv({
      query: topic,
      maxResults: DAILY_READING.MAX_RESULTS_PER_TOPIC,
    });
    return results.map((paper) => toArxivCandidate(paper, sourceConfig));
  },
} satisfies SourceCollector;

const DEFAULT_SOURCE_COLLECTORS = [
  {
    sourceId: SOURCES.HACKER_NEWS,
    async collect(topic: string, sourceConfig: SourceRegistryItem) {
      const results = await searchHackerNews({
        query: topic,
        maxResults: DAILY_READING.MAX_RESULTS_PER_TOPIC,
      });
      return results.map((story) => toHackerNewsCandidate(story, sourceConfig));
    },
  },
] satisfies SourceCollector[];

const SOURCE_COLLECTORS = new Map<string, SourceCollector>(
  [...DEFAULT_SOURCE_COLLECTORS, ACADEMIC_FALLBACK_COLLECTOR].map((sourceCollector) => [
    sourceCollector.sourceId,
    sourceCollector,
  ]),
);

function isAcademicFallbackSource(source: SourceRegistryItem): boolean {
  return source.sourceType === SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC_FALLBACK;
}

function compareRegistrySources(left: SourceRegistryItem, right: SourceRegistryItem): number {
  const priorityOrder = left.priority - right.priority;
  return priorityOrder !== 0 ? priorityOrder : left.id.localeCompare(right.id);
}

function isSupportedDailySource(sourceId: string): boolean {
  return SOURCE_COLLECTORS.has(sourceId);
}

function dailyMixWeight(dailyMix: DailyMix, sourceId: string): number {
  return dailyMix[sourceId] ?? 0;
}

function isCollectableDailySource(source: SourceRegistryItem): boolean {
  return isSupportedDailySource(source.id) || source.domains.length > 0;
}

type DailySourceRegistryItem = SourceRegistryItem;

export function listEnabledDailySourceConfigs(
  sourceRegistry: SourceRegistry,
  enableAcademicFallback = false,
  dailyMix?: DailyMix,
): DailySourceRegistryItem[] {
  return sourceRegistry.sources
    .filter((source) => source.enabled)
    .filter((source) => enableAcademicFallback || !isAcademicFallbackSource(source))
    .filter((source) => !dailyMix || dailyMixWeight(dailyMix, source.id) > 0)
    .filter((source): source is DailySourceRegistryItem => isCollectableDailySource(source))
    .sort(compareRegistrySources);
}

function getDailySourceCollector(sourceConfig: SourceRegistryItem): SourceCollector {
  const sourceCollector = SOURCE_COLLECTORS.get(sourceConfig.id);
  if (sourceCollector) {
    return sourceCollector;
  }

  return {
    sourceId: sourceConfig.id,
    async collect(topic: string) {
      return searchSourceDomain(
        {
          sourceId: sourceConfig.id,
          query: topic,
          maxResults: DAILY_READING.MAX_RESULTS_PER_TOPIC,
        },
        {
          sourceRegistry: {
            sources: [sourceConfig],
          },
        },
      );
    },
  };
}

export function listDailySources(
  sourceRegistry: SourceRegistry,
  enableAcademicFallback = false,
): string[] {
  return listEnabledDailySourceConfigs(sourceRegistry, enableAcademicFallback).map(
    (sourceConfig) => sourceConfig.id,
  );
}

export async function collectDailyCandidateResult(
  sourceRegistry: SourceRegistry,
  options: DailyCollectionOptions = {},
): Promise<DailyCollectionResult> {
  const sourceConfigs = listEnabledDailySourceConfigs(
    sourceRegistry,
    options.enableAcademicFallback,
    options.dailyMix,
  );
  const sourcesUsed = sourceConfigs.map((sourceConfig) => sourceConfig.id);
  const sourceResults = await mapLimit(
    sourceConfigs,
    SOURCE_COLLECTION_CONCURRENCY,
    async (sourceConfig) => {
      const candidates: CandidateItem[] = [];
      const errors: DailyCollectionError[] = [];
      const sourceCollector = getDailySourceCollector(sourceConfig);

      for (const query of sourceConfig.searchQueries) {
        const result = await collectFromSource(sourceCollector, query, sourceConfig);
        candidates.push(...result.candidates);
        if (result.error) {
          errors.push(result.error);
          if (isRateLimitError(result.error)) {
            break;
          }
        }
      }

      return { candidates, errors };
    },
  );
  const candidates = sourceResults.flatMap((result) => result.candidates);
  const errors = sourceResults.flatMap((result) => result.errors);

  return {
    candidates: rankDailyCandidates(candidates, DAILY_READING.MAX_CANDIDATES, options.dailyMix),
    errors,
    sourcesUsed,
  };
}

export async function collectDailyCandidates(
  sourceRegistry: SourceRegistry,
  options: DailyCollectionOptions = {},
): Promise<CandidateItem[]> {
  return (await collectDailyCandidateResult(sourceRegistry, options)).candidates;
}
