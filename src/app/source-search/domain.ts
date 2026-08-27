import type { SourceRegistryItem } from "../config/sourceRegistry.js";
import { loadSourceRegistry } from "../config/sourceRegistry.js";
import { searchWeb } from "../brave-search/client.js";
import type { SearchWebResult } from "../brave-search/client.js";
import type { ResearchResult } from "../research/types.js";
import { mapLimit } from "../../framework/async/mapLimit.js";
import { normalizeUrl } from "../../framework/network/normalizeUrl.js";

const SITE_QUERY_PREFIX = "site:";
const DOMAIN_SEARCH_CONCURRENCY = 3;

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

function toResearchResult(
  source: SourceRegistryItem,
  result: SearchWebResult,
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
    discoveredAt: new Date().toISOString(),
    raw: result.raw,
  };
}

function dedupeResearchResults(results: ResearchResult[]): ResearchResult[] {
  const seen = new Set<string>();
  const deduped: ResearchResult[] = [];

  for (const result of results) {
    if (seen.has(result.url)) {
      continue;
    }

    seen.add(result.url);
    deduped.push(result);
  }

  return deduped;
}

export async function searchSourceDomain(
  { sourceId, query, maxResults = 10, signal }: SearchSourceDomainOptions,
  dependencies: SearchSourceDomainDependencies = {},
): Promise<ResearchResult[]> {
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

      const candidates: ResearchResult[] = [];
      for (const result of results) {
        const candidate = toResearchResult(source, result);
        if (candidate) {
          candidates.push(candidate);
        }
      }

      return candidates;
    },
  );

  return dedupeResearchResults(candidateGroups.flat()).slice(0, maxResults);
}
