import { searchArxiv } from "../arxiv/client.js";
import type { ArxivPaper } from "../arxiv/client.js";
import { DAILY_READING, SOURCES } from "../constants.js";
import { searchHackerNews } from "../hackernews/client.js";
import type { HackerNewsStory } from "../hackernews/client.js";
import type { CandidateItem } from "./types.js";

export type DailyCollectionError = {
  source: CandidateItem["source"];
  topic: string;
  error: string;
};

export type DailyCollectionResult = {
  candidates: CandidateItem[];
  errors: DailyCollectionError[];
};

type SourceCollectionResult = {
  candidates: CandidateItem[];
  error?: DailyCollectionError;
};

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
): CandidateItem[] {
  return dedupeByUrl([...candidates].sort(compareCandidates)).slice(0, maxCandidates);
}

function isRateLimitError(error: DailyCollectionError): boolean {
  return error.error.includes(DAILY_READING.RATE_LIMIT_ERROR_FRAGMENT);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function collectArxivCandidates(topic: string): Promise<SourceCollectionResult> {
  try {
    const results = await searchArxiv({ query: topic, maxResults: DAILY_READING.MAX_RESULTS_PER_TOPIC });
    return { candidates: results.map(toArxivCandidate) };
  } catch (error) {
    return {
      candidates: [],
      error: {
        source: SOURCES.ARXIV,
        topic,
        error: getErrorMessage(error),
      },
    };
  }
}

async function collectHackerNewsCandidates(topic: string): Promise<SourceCollectionResult> {
  try {
    const results = await searchHackerNews({ query: topic, maxResults: DAILY_READING.MAX_RESULTS_PER_TOPIC });
    return { candidates: results.map(toHackerNewsCandidate) };
  } catch (error) {
    return {
      candidates: [],
      error: {
        source: SOURCES.HACKER_NEWS,
        topic,
        error: getErrorMessage(error),
      },
    };
  }
}

export async function collectDailyCandidateResult(): Promise<DailyCollectionResult> {
  const candidates: CandidateItem[] = [];
  const errors: DailyCollectionError[] = [];
  const disabledSources = new Set<CandidateItem["source"]>();

  for (const topic of DAILY_READING.TOPICS) {
    const skippedSourceResult: SourceCollectionResult = { candidates: [] };
    const sourceResults = await Promise.all([
      disabledSources.has(SOURCES.ARXIV) ? Promise.resolve(skippedSourceResult) : collectArxivCandidates(topic),
      disabledSources.has(SOURCES.HACKER_NEWS)
        ? Promise.resolve(skippedSourceResult)
        : collectHackerNewsCandidates(topic),
    ]);

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
    candidates: rankDailyCandidates(candidates),
    errors,
  };
}

export async function collectDailyCandidates(): Promise<CandidateItem[]> {
  return (await collectDailyCandidateResult()).candidates;
}
