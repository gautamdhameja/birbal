// Purpose: Implements the Birbal pipeline component: search.
// Scope: Keeps app-specific pipeline behavior outside the generic framework.

import type { SearchWebResult } from "../../brave-search/client.js";
import { mapLimit } from "../../framework/pipeline/concurrency.js";
import { normalizeUrl } from "../../utils/url.js";

export type UseCaseSearchConfig = {
  prioritizedDomains: string[];
  maxSearchQueries: number;
  maxSearchResultsPerQuery: number;
  maxCandidatesForExtraction: number;
  freshness?: string;
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

function compareCandidates(
  left: UseCaseSearchCandidate,
  right: UseCaseSearchCandidate,
  prioritizedDomains: readonly string[],
): number {
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
  const candidates = searchResults.flatMap((result) => result.candidates);
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
