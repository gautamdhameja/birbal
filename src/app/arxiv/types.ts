import type { fetchWithRetry } from "../../framework/network/fetch.js";
import type { ArxivConfig } from "./config.js";

export type ArxivSearchOptions = {
  query: string;
  maxResults: number;
  signal?: AbortSignal;
};

export type ArxivPaper = {
  title: string;
  url: string;
  summary: string;
  authors: string[];
  published: string;
};

export type ArxivSearchTransport = typeof fetchWithRetry;

export type ArxivClientDependencies = {
  loadConfig?: () => ArxivConfig;
  transport?: ArxivSearchTransport;
  now?: () => number;
  delay?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

export type ArxivSearch = (options: ArxivSearchOptions) => Promise<ArxivPaper[]>;

export type ArxivClient = {
  searchArxiv: ArxivSearch;
};
