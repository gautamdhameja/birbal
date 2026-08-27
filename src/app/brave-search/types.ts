import type { fetchWithRetry } from "../../framework/network/fetch.js";
import type { WebSearchPort } from "../source-search/types.js";
import type { BraveSearchConfig } from "./config.js";

export type BraveSearchQuotaState = {
  calls: number;
  rateLimited: boolean;
};

export type BraveSearchTransport = typeof fetchWithRetry;

export type BraveSearchClientDependencies = {
  loadConfig?: () => BraveSearchConfig;
  transport?: BraveSearchTransport;
};

export type BraveSearchClient = {
  searchWeb: WebSearchPort;
};
