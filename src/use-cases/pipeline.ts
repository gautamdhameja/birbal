import { searchWeb } from "../brave-search/client.js";
import type { SearchWebResult } from "../brave-search/client.js";
import { USE_CASES } from "../constants.js";
import { fetchUrlText } from "../url-text/client.js";
import type { FetchUrlTextResult } from "../url-text/client.js";
import { normalizeUrl } from "../utils/url.js";
import { loadProductionUseCaseScoutConfig } from "./config.js";
import { extractProductionUseCase } from "./extraction.js";
import type { ProductionUseCaseExtraction } from "./extraction.js";
import type {
  ProductionUseCase,
  ProductionUseCaseRunResult,
  ProductionUseCaseRunOptions,
  ProductionUseCaseScoutConfig,
  UseCaseSearchCandidate,
} from "./types.js";

type ProductionUseCasePipelineDependencies = {
  loadConfig(): ProductionUseCaseScoutConfig;
  searchWeb(query: string, maxResults: number, freshness?: string): Promise<SearchWebResult[]>;
  fetchUrlText(url: string): Promise<FetchUrlTextResult>;
  extractUseCase(
    candidate: UseCaseSearchCandidate,
    fetched: FetchUrlTextResult,
  ): Promise<ProductionUseCaseExtraction>;
};

type CandidateCollectionResult = {
  candidates: UseCaseSearchCandidate[];
  searchErrors: Array<{ query: string; error: string }>;
};

const defaultDependencies: ProductionUseCasePipelineDependencies = {
  loadConfig: loadProductionUseCaseScoutConfig,
  searchWeb: (query, maxResults, freshness) => searchWeb({ query, maxResults, freshness }),
  fetchUrlText: (url) => fetchUrlText({ url }),
  extractUseCase: extractProductionUseCase,
};

function allQueries(config: ProductionUseCaseScoutConfig): string[] {
  return [...config.sourceSpecificQueries, ...config.dailyQueries];
}

function toTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function truncateErrorMessage(message: string): string {
  if (message.length <= USE_CASES.MAX_ERROR_MESSAGE_LENGTH) {
    return message;
  }

  return `${message.slice(0, USE_CASES.MAX_ERROR_MESSAGE_LENGTH)}...`;
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

async function collectCandidates(
  config: ProductionUseCaseScoutConfig,
  search: ProductionUseCasePipelineDependencies["searchWeb"],
): Promise<CandidateCollectionResult> {
  const candidates: UseCaseSearchCandidate[] = [];
  const searchErrors: Array<{ query: string; error: string }> = [];

  for (const query of allQueries(config)) {
    try {
      const results = await search(query, config.maxSearchResultsPerQuery, config.freshness);
      for (const result of results) {
        const candidate = toCandidate(query, result);
        if (candidate) {
          candidates.push(candidate);
        }
      }
    } catch (error) {
      searchErrors.push({
        query,
        error: formatError(error),
      });
    }
  }

  return {
    candidates: dedupeCandidates(candidates)
      .sort((left, right) => compareCandidates(left, right, config.prioritizedDomains))
      .slice(0, config.maxCandidatesForExtraction),
    searchErrors,
  };
}

export async function runProductionUseCaseScout(
  dependencies: Partial<ProductionUseCasePipelineDependencies> = {},
  options: ProductionUseCaseRunOptions = {},
): Promise<ProductionUseCaseRunResult> {
  const deps = {
    ...defaultDependencies,
    ...dependencies,
  };
  const config = deps.loadConfig();
  const maxResults = options.maxResults ?? config.maxResults;
  const { candidates, searchErrors } = await collectCandidates(config, deps.searchWeb);
  const results: ProductionUseCase[] = [];
  const fetchErrors: Array<{ url: string; error: string }> = [];
  const extractionErrors: Array<{ url: string; error: string }> = [];
  let fetched = 0;
  let rejected = 0;

  for (const candidate of candidates) {
    if (results.length >= maxResults) {
      break;
    }

    let fetchedText: FetchUrlTextResult;
    try {
      fetchedText = await deps.fetchUrlText(candidate.url);
      fetched += 1;
    } catch (error) {
      fetchErrors.push({
        url: candidate.url,
        error: formatError(error),
      });
      continue;
    }

    try {
      const extraction = await deps.extractUseCase(candidate, fetchedText);
      if (extraction.accepted) {
        const { accepted: _accepted, ...result } = extraction;
        results.push(result);
      } else {
        rejected += 1;
      }
    } catch (error) {
      extractionErrors.push({
        url: candidate.url,
        error: formatError(error),
      });
    }
  }

  return {
    searchedQueries: allQueries(config).length,
    collected: candidates.length,
    fetched,
    accepted: results.length,
    rejected,
    searchErrors,
    fetchErrors,
    extractionErrors,
    results,
    failed: results.length === 0,
  };
}
