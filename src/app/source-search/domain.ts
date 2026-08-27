import { loadSourceRegistry } from "../config/sourceRegistry.js";
import { searchWeb } from "../brave-search/client.js";
import type { SearchWebResult } from "../brave-search/client.js";
import type { ResearchResult } from "../research/types.js";
import type { SourceDescriptor } from "../sources/types.js";
import { normalizeUrl } from "../../framework/network/normalizeUrl.js";

const SITE_QUERY_PREFIX = "site:";

export type SearchSourceDomainOptions = {
  sourceId: string;
  query: string;
  maxResults?: number;
  signal?: AbortSignal;
};

export type WebSearchPort = (options: {
  query: string;
  maxResults?: number;
  freshness?: string;
  signal?: AbortSignal;
}) => Promise<SearchWebResult[]>;

export type SourceDomainSearchDependencies = {
  loadSourceRegistry?: () => { sources: SourceDescriptor[] };
  searchWeb?: WebSearchPort;
  now?: () => Date;
};

function buildDomainQuery(query: string, domain: string): string {
  return `${query} ${SITE_QUERY_PREFIX}${domain}`;
}

function findSource(sourceId: string, sources: SourceDescriptor[]): SourceDescriptor {
  const source = sources.find(
    (sourceConfig) => sourceConfig.id === sourceId && sourceConfig.enabled,
  );
  if (!source) {
    throw new Error(`Unknown source: ${sourceId}`);
  }

  return source;
}

function isSourceDomainUrl(url: string, domains: readonly string[]): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    return domains.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

function toResearchResult(
  source: SourceDescriptor,
  result: SearchWebResult,
  discoveredAt: string,
): ResearchResult | undefined {
  const url = normalizeUrl(result.url);
  if (!url || !isSourceDomainUrl(url, source.domains)) {
    return undefined;
  }

  return {
    id: `${source.id}:${url}`,
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.sourceType,
    title: result.title,
    url,
    summary: result.description,
    publishedAt: result.publishedAt ?? "",
    discoveredAt,
  };
}

export function createSourceDomainSearch(
  dependencies: SourceDomainSearchDependencies = {},
): (options: SearchSourceDomainOptions) => Promise<ResearchResult[]> {
  const loadRegistry = dependencies.loadSourceRegistry ?? loadSourceRegistry;
  const runWebSearch = dependencies.searchWeb ?? searchWeb;
  const now = dependencies.now ?? (() => new Date());

  return async ({ sourceId, query, maxResults = 10, signal }) => {
    const source = findSource(sourceId, loadRegistry().sources);
    const seenUrls = new Set<string>();
    const candidates: ResearchResult[] = [];

    for (const domain of source.domains) {
      const results = await runWebSearch({
        query: buildDomainQuery(query, domain),
        maxResults,
        signal,
      });

      for (const result of results) {
        const candidate = toResearchResult(source, result, now().toISOString());
        if (!candidate || seenUrls.has(candidate.url)) {
          continue;
        }

        seenUrls.add(candidate.url);
        candidates.push(candidate);

        if (candidates.length === maxResults) {
          return candidates;
        }
      }
    }

    return candidates;
  };
}

const defaultSourceDomainSearch = createSourceDomainSearch();

export const searchSourceDomain = defaultSourceDomainSearch;
