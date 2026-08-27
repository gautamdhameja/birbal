import { loadSourceRegistry } from "../config/sourceRegistry.js";
import type { ResearchResult } from "../research/types.js";
import type { SourceDescriptor } from "../sources/types.js";
import { normalizeUrl } from "../../framework/network/normalizeUrl.js";
import type {
  SourceDomainSearch,
  SourceDomainSearchDependencies,
  WebSearchResult,
} from "./types.js";
import { WEB_SEARCH_POLICY } from "./policy.js";
export type { SearchSourceDomainOptions, SourceDomainSearch } from "./types.js";

const SITE_QUERY_PREFIX = "site:";

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
  result: WebSearchResult,
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
  dependencies: SourceDomainSearchDependencies,
): SourceDomainSearch {
  const loadRegistry = dependencies.loadSourceRegistry ?? loadSourceRegistry;
  const runWebSearch = dependencies.searchWeb;
  const now = dependencies.now ?? (() => new Date());

  return async ({
    sourceId,
    query,
    maxResults = WEB_SEARCH_POLICY.DEFAULT_MAX_RESULTS,
    signal,
  }) => {
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
