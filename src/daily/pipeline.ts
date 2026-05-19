import { searchArxiv } from "../arxiv/client.js";
import type { ArxivPaper } from "../arxiv/client.js";
import { DAILY_READING } from "../constants/daily.js";
import { SOURCES } from "../constants/sources.js";
import { searchHackerNews } from "../hackernews/client.js";
import type { HackerNewsStory } from "../hackernews/client.js";
import { isHttpStatusError } from "../http/client.js";
import type { UserPreferences } from "../memory/types.js";
import type { CandidateItem } from "./types.js";

export type DailyCollectionError = {
  source: CandidateItem["source"];
  topic: string;
  error: string;
  status?: number;
};

export type DailyCollectionResult = {
  candidates: CandidateItem[];
  errors: DailyCollectionError[];
};

type SourceCollectionResult = {
  candidates: CandidateItem[];
  error?: DailyCollectionError;
};

type SourceCollector = {
  source: CandidateItem["source"];
  collect(topic: string): Promise<CandidateItem[]>;
};

type DailyMix = UserPreferences["dailyMix"];

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export function toArxivCandidate(paper: ArxivPaper): CandidateItem {
  const url = normalizeUrl(paper.url);

  return {
    id: `${SOURCES.ARXIV}:${url}`,
    source: SOURCES.ARXIV,
    title: paper.title,
    url,
    summary: paper.summary,
    publishedAt: paper.published,
    raw: paper,
  };
}

export function toHackerNewsCandidate(story: HackerNewsStory): CandidateItem {
  const url = normalizeUrl(story.url);

  return {
    id: `${SOURCES.HACKER_NEWS}:${url}`,
    source: SOURCES.HACKER_NEWS,
    title: story.title,
    url,
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

  const sourceOrder = left.source.localeCompare(right.source);
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

function calculateSourceQuotas(
  maxCandidates: number,
  dailyMix: DailyMix,
): Map<CandidateItem["source"], number> {
  const weightedSources = Object.entries(dailyMix)
    .map(([source, weight]) => ({
      source: source as CandidateItem["source"],
      weight,
    }))
    .filter(({ weight }) => weight > 0);

  const totalWeight = weightedSources.reduce((sum, { weight }) => sum + weight, 0);
  if (totalWeight <= 0) {
    return new Map();
  }

  const quotas = new Map<CandidateItem["source"], number>();
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
    const sourceCandidates = rankedCandidates.filter((candidate) => candidate.source === source);
    for (const candidate of sourceCandidates.slice(0, quota)) {
      selectedIds.add(candidate.id);
      selectedCandidates.push(candidate);
    }
  }

  for (const candidate of rankedCandidates) {
    if (selectedCandidates.length >= maxCandidates) {
      break;
    }

    if (!allowedSources.has(candidate.source) || selectedIds.has(candidate.id)) {
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
): Promise<SourceCollectionResult> {
  try {
    return { candidates: await sourceCollector.collect(topic) };
  } catch (error) {
    return {
      candidates: [],
      error: {
        source: sourceCollector.source,
        topic,
        error: error instanceof Error ? error.message : String(error),
        status: isHttpStatusError(error) ? error.status : undefined,
      },
    };
  }
}

const SOURCE_COLLECTORS = [
  {
    source: SOURCES.ARXIV,
    async collect(topic: string) {
      const results = await searchArxiv({
        query: topic,
        maxResults: DAILY_READING.MAX_RESULTS_PER_TOPIC,
      });
      return results.map(toArxivCandidate);
    },
  },
  {
    source: SOURCES.HACKER_NEWS,
    async collect(topic: string) {
      const results = await searchHackerNews({
        query: topic,
        maxResults: DAILY_READING.MAX_RESULTS_PER_TOPIC,
      });
      return results.map(toHackerNewsCandidate);
    },
  },
] satisfies SourceCollector[];

export async function collectDailyCandidateResult(
  topics: readonly string[] = DAILY_READING.TOPICS,
  dailyMix?: DailyMix,
): Promise<DailyCollectionResult> {
  const candidates: CandidateItem[] = [];
  const errors: DailyCollectionError[] = [];
  const disabledSources = new Set<CandidateItem["source"]>();

  for (const topic of topics) {
    const skippedSourceResult: SourceCollectionResult = { candidates: [] };
    const sourceResults = await Promise.all(
      SOURCE_COLLECTORS.map((sourceCollector) =>
        disabledSources.has(sourceCollector.source)
          ? skippedSourceResult
          : collectFromSource(sourceCollector, topic),
      ),
    );

    for (const result of sourceResults) {
      candidates.push(...result.candidates);
      if (result.error) {
        errors.push(result.error);
        if (isRateLimitError(result.error)) {
          disabledSources.add(result.error.source);
        }
      }
    }
  }

  return {
    candidates: rankDailyCandidates(candidates, DAILY_READING.MAX_CANDIDATES, dailyMix),
    errors,
  };
}

export async function collectDailyCandidates(
  topics: readonly string[] = DAILY_READING.TOPICS,
  dailyMix?: DailyMix,
): Promise<CandidateItem[]> {
  return (await collectDailyCandidateResult(topics, dailyMix)).candidates;
}
