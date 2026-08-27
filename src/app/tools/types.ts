import type { ArxivSearch } from "../arxiv/types.js";
import type { HackerNewsSearch } from "../hackernews/types.js";
import type { SourceDomainSearch, WebSearchPort } from "../source-search/types.js";
import type { FetchUrlTextResult, UrlTextRequest } from "../url-text/types.js";

export type FetchUrlTextOperation = (options: UrlTextRequest) => Promise<FetchUrlTextResult>;

export type ResearchToolOperations = {
  now: () => Date;
  searchArxiv: ArxivSearch;
  searchHackerNews: HackerNewsSearch;
  searchWeb: WebSearchPort;
  searchSourceDomain: SourceDomainSearch;
  fetchUrlText: FetchUrlTextOperation;
};
