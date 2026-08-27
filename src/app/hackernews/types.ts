import type { fetchWithRetry } from "../../framework/network/fetch.js";
import type { HackerNewsConfig } from "./config.js";

export type HackerNewsSearchOptions = {
  query: string;
  maxResults: number;
  signal?: AbortSignal;
};

export type HackerNewsStory = {
  title: string;
  url: string;
  hn_url: string;
  points: number | null;
  author: string;
  created_at: string;
};

export type HackerNewsTransport = typeof fetchWithRetry;

export type HackerNewsClientDependencies = {
  loadConfig?: () => HackerNewsConfig;
  transport?: HackerNewsTransport;
};

export type HackerNewsSearch = (options: HackerNewsSearchOptions) => Promise<HackerNewsStory[]>;

export type HackerNewsClient = {
  searchHackerNews: HackerNewsSearch;
};
