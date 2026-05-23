import type { SourceRegistryItem } from "../config/sourceRegistry.js";
import { loadSourceRegistry } from "../config/sourceRegistry.js";
import { searchWeb } from "../brave-search/client.js";
import type { SearchWebResult } from "../brave-search/client.js";
import { CONTENT_FETCH_STATUSES } from "../daily/types.js";
import type { CandidateSourceType, ContentFetchStatus } from "../daily/types.js";
import { mapLimit } from "../framework/pipeline/concurrency.js";
import { normalizeUrl } from "../utils/url.js";

const SITE_QUERY_PREFIX = "site:";
const DOMAIN_SEARCH_CONCURRENCY = 3;

export type SourceDomainCandidate = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: CandidateSourceType;
  title: string;
  url: string;
  summary: string;
  publishedAt: string;
  discoveredAt: string;
  contentFetchStatus: ContentFetchStatus;
  raw: unknown;
};

export type SearchSourceDomainOptions = {
  sourceId: string;
  query: string;
  maxResults?: number;
  signal?: AbortSignal;
};

type SearchSourceDomainDependencies = {
  sourceRegistry?: {
    sources: SourceRegistryItem[];
  };
};

function buildDomainQuery(query: string, domain: string): string {
  return `${query} ${SITE_QUERY_PREFIX}${domain}`;
}

function findSource(sourceId: string, sources: SourceRegistryItem[]): SourceRegistryItem {
  const source = sources.find((sourceConfig) => sourceConfig.id === sourceId);
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

function toSourceDomainCandidate(
  source: SourceRegistryItem,
  result: SearchWebResult,
): SourceDomainCandidate | undefined {
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
    discoveredAt: new Date().toISOString(),
    contentFetchStatus: CONTENT_FETCH_STATUSES.NOT_FETCHED,
    raw: result.raw,
  };
}

function dedupeSourceDomainCandidates(
  candidates: SourceDomainCandidate[],
): SourceDomainCandidate[] {
  const seen = new Set<string>();
  const deduped: SourceDomainCandidate[] = [];

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

export async function searchSourceDomain(
  { sourceId, query, maxResults = 10, signal }: SearchSourceDomainOptions,
  dependencies: SearchSourceDomainDependencies = {},
): Promise<SourceDomainCandidate[]> {
  const sourceRegistry = dependencies.sourceRegistry ?? loadSourceRegistry();
  const source = findSource(sourceId, sourceRegistry.sources);
  const candidateGroups = await mapLimit(
    source.domains,
    DOMAIN_SEARCH_CONCURRENCY,
    async (domain) => {
      const results = await searchWeb({
        query: buildDomainQuery(query, domain),
        maxResults,
        signal,
      });

      const candidates: SourceDomainCandidate[] = [];
      for (const result of results) {
        const candidate = toSourceDomainCandidate(source, result);
        if (candidate) {
          candidates.push(candidate);
        }
      }

      return candidates;
    },
  );

  return dedupeSourceDomainCandidates(candidateGroups.flat()).slice(0, maxResults);
}
