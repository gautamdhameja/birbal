import type { ResearchResult } from "../research/types.js";
import type { SourceDescriptor } from "../sources/types.js";

export type WebSearchOptions = {
  query: string;
  maxResults?: number;
  freshness?: string;
  signal?: AbortSignal;
};

export type WebSearchResult = {
  title: string;
  url: string;
  description: string;
  publishedAt?: string;
  sourceName?: string;
};

export type WebSearchPort = (options: WebSearchOptions) => Promise<WebSearchResult[]>;

export type SearchSourceDomainOptions = {
  sourceId: string;
  query: string;
  maxResults?: number;
  signal?: AbortSignal;
};

export type SourceDomainSearch = (options: SearchSourceDomainOptions) => Promise<ResearchResult[]>;

export type SourceDomainSearchDependencies = {
  searchWeb: WebSearchPort;
  loadSourceRegistry?: () => { sources: SourceDescriptor[] };
  now?: () => Date;
};
