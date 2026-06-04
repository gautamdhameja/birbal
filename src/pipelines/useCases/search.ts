// Purpose: Implements the Birbal pipeline component: search.
// Scope: Keeps app-specific pipeline behavior outside the generic framework.

import type { SearchWebResult } from "../../brave-search/client.js";
import { mapLimit } from "../../framework/pipeline/concurrency.js";
import { normalizeUrl } from "../../utils/url.js";
import { isWithinAgeWindow } from "./freshness.js";

export type UseCaseSearchConfig = {
  prioritizedDomains: string[];
  maxSearchQueries: number;
  maxSearchResultsPerQuery: number;
  maxCandidatesForExtraction: number;
  freshness?: string;
  maxCandidateAgeDays?: number;
  referenceDate?: Date;
};

export type UseCaseSearchCandidate = {
  id: string;
  query: string;
  title: string;
  url: string;
  description: string;
  publishedAt: string;
  sourceName?: string;
  raw: unknown;
};

export type UseCaseCandidateCollectionResult = {
  candidates: UseCaseSearchCandidate[];
  searchedQueries: number;
  searchErrors: Array<{ query: string; error: string }>;
};

type UseCaseSearchFunction = (
  query: string,
  maxResults: number,
  freshness?: string,
) => Promise<SearchWebResult[]>;

const SEARCH_CONCURRENCY = 3;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const STRONG_RELEVANCE_PATTERNS = [
  /\/case-studies?\//u,
  /\/customers\/story\//u,
  /\/customer-stories\//u,
  /\/customers\//u,
  /\/client-stories\//u,
  /\bcustomer stories?\b/u,
  /\bcase stud(?:y|ies)\b/u,
  /\bclient story\b/u,
  /\bproduction deployment\b/u,
  /\brolled out\b/u,
  /\blive deployment\b/u,
] as const;
const RELEVANCE_PATTERNS = [
  /\bworkflow\b/u,
  /\bdeployed\b/u,
  /\bdeployment\b/u,
  /\bproduction\b/u,
  /\bbusiness outcome\b/u,
  /\bmeasurable outcome\b/u,
  /\broi\b/u,
  /\bsaved\b/u,
  /\breduced\b/u,
  /\bincreased\b/u,
  /\bautomated\b/u,
  /\bemployees\b/u,
  /\bcontact center\b/u,
  /\bcustomer support\b/u,
  /\bprocurement\b/u,
  /\bfinance\b/u,
  /\bsupply chain\b/u,
  /\bassistant\b/u,
  /\bcopilot\b/u,
  /\bagent\b/u,
  /\bagents\b/u,
  /\bazure openai\b/u,
  /\bbedrock\b/u,
  /\bgemini\b/u,
  /\bclaude\b/u,
] as const;

function toTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function truncateErrorMessage(message: string): string {
  if (message.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return message;
  }

  return `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...`;
}

function formatError(error: unknown): string {
  return truncateErrorMessage(error instanceof Error ? error.message : String(error));
}

function hostname(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function domainPriority(url: string, prioritizedDomains: readonly string[]): number {
  const host = hostname(url);
  const priority = prioritizedDomains.findIndex(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );

  return priority === -1 ? prioritizedDomains.length : priority;
}

function relevanceText(candidate: UseCaseSearchCandidate): string {
  return [candidate.title, candidate.description, candidate.url, candidate.sourceName ?? ""]
    .join(" ")
    .toLowerCase();
}

function patternScore(text: string, patterns: readonly RegExp[], points: number): number {
  return patterns.reduce((score, pattern) => (pattern.test(text) ? score + points : score), 0);
}

function metricSignalScore(text: string): number {
  const hasNumber =
    /\b\d+(?:\.\d+)?(?:%| percent|x| hours?| minutes?| days?| weeks?| months?| million| billion| employees?)\b/u.test(
      text,
    );
  return hasNumber ? 2 : 0;
}

export function useCaseSearchRelevanceScore(candidate: UseCaseSearchCandidate): number {
  const text = relevanceText(candidate);

  return (
    patternScore(text, STRONG_RELEVANCE_PATTERNS, 5) +
    patternScore(text, RELEVANCE_PATTERNS, 2) +
    metricSignalScore(text)
  );
}

function compareCandidates(
  left: UseCaseSearchCandidate,
  right: UseCaseSearchCandidate,
  prioritizedDomains: readonly string[],
): number {
  const relevanceOrder = useCaseSearchRelevanceScore(right) - useCaseSearchRelevanceScore(left);
  if (relevanceOrder !== 0) {
    return relevanceOrder;
  }

  const priorityOrder =
    domainPriority(left.url, prioritizedDomains) - domainPriority(right.url, prioritizedDomains);
  if (priorityOrder !== 0) {
    return priorityOrder;
  }

  const publishedOrder = toTimestamp(right.publishedAt) - toTimestamp(left.publishedAt);
  if (publishedOrder !== 0) {
    return publishedOrder;
  }

  return left.title.localeCompare(right.title);
}

function toCandidate(query: string, result: SearchWebResult): UseCaseSearchCandidate | null {
  const url = normalizeUrl(result.url);
  if (!url || !result.publishedAt) {
    return null;
  }

  return {
    id: `use-case:${url}`,
    query,
    title: result.title,
    url,
    description: result.description,
    publishedAt: result.publishedAt,
    sourceName: result.sourceName,
    raw: result.raw,
  };
}

export function isRecentUseCaseSearchCandidate(
  candidate: UseCaseSearchCandidate,
  config: Pick<UseCaseSearchConfig, "maxCandidateAgeDays" | "referenceDate">,
): boolean {
  return isWithinAgeWindow({
    maxAgeDays: config.maxCandidateAgeDays,
    publishedAt: candidate.publishedAt,
    referenceDate: config.referenceDate ?? new Date(),
  });
}

function dedupeCandidates(candidates: UseCaseSearchCandidate[]): UseCaseSearchCandidate[] {
  const seen = new Set<string>();
  const deduped: UseCaseSearchCandidate[] = [];

  for (const candidate of candidates) {
    const canonicalUrl = normalizeUrl(candidate.url);
    if (seen.has(canonicalUrl)) {
      continue;
    }

    seen.add(canonicalUrl);
    deduped.push(candidate);
  }

  return deduped;
}

export async function collectUseCaseSearchCandidates(
  config: UseCaseSearchConfig,
  search: UseCaseSearchFunction,
  queries: readonly string[],
): Promise<UseCaseCandidateCollectionResult> {
  const searchQueries = queries.slice(0, config.maxSearchQueries);
  const searchResults = await mapLimit(searchQueries, SEARCH_CONCURRENCY, async (query) => {
    try {
      const results = await search(query, config.maxSearchResultsPerQuery, config.freshness);
      const candidates: UseCaseSearchCandidate[] = [];
      for (const result of results) {
        const candidate = toCandidate(query, result);
        if (candidate) {
          candidates.push(candidate);
        }
      }

      return { candidates, error: null };
    } catch (error) {
      return {
        candidates: [],
        error: {
          query,
          error: formatError(error),
        },
      };
    }
  });
  const candidates = searchResults
    .flatMap((result) => result.candidates)
    .filter((candidate) => isRecentUseCaseSearchCandidate(candidate, config));
  const searchErrors = searchResults
    .map((result) => result.error)
    .filter((error): error is { query: string; error: string } => error !== null);

  return {
    candidates: dedupeCandidates(candidates)
      .sort((left, right) => compareCandidates(left, right, config.prioritizedDomains))
      .slice(0, config.maxCandidatesForExtraction),
    searchedQueries: searchQueries.length,
    searchErrors,
  };
}

export function searchSnapshotItemToCandidate(item: {
  query: string;
  title: string;
  url: string;
  description: string;
  publishedAt: string;
  sourceName?: string;
  raw: unknown;
}): UseCaseSearchCandidate {
  const url = normalizeUrl(item.url);

  return {
    id: `use-case:${url}`,
    query: item.query,
    title: item.title,
    url,
    description: item.description,
    publishedAt: item.publishedAt,
    sourceName: item.sourceName,
    raw: item.raw,
  };
}
