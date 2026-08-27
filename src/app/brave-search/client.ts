import { z } from "zod";

import { BRAVE_SEARCH } from "../constants/brave-search.js";
import { HTTP } from "../../framework/network/constants.js";
import { fetchWithRetry } from "../../framework/network/fetch.js";
import { buildHttpStatusError, readResponseJson } from "../../framework/network/client.js";
import { getBraveSearchConfig } from "./config.js";
import type { WebSearchOptions, WebSearchResult } from "../source-search/types.js";
import type { BraveSearchClient, BraveSearchClientDependencies } from "./types.js";
export type {
  WebSearchOptions as SearchWebOptions,
  WebSearchResult as SearchWebResult,
} from "../source-search/types.js";
export type { BraveSearchClient } from "./types.js";

type NormalizedSearchWebOptions = {
  query: string;
  maxResults: number;
  freshness: string;
};

type BraveSearchQuotaState = {
  calls: number;
  rateLimited: boolean;
};

const BraveWebResultSchema = z.looseObject({
  title: z.string().catch(""),
  url: z.string().catch(""),
  description: z.string().catch(""),
  page_age: z.string().optional().catch(undefined),
  age: z.string().optional().catch(undefined),
  profile: z
    .looseObject({
      name: z.string().optional().catch(undefined),
      long_name: z.string().optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
  meta_url: z
    .looseObject({
      hostname: z.string().optional().catch(undefined),
      netloc: z.string().optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

const BraveSearchResponseSchema = z.looseObject({
  web: z
    .looseObject({
      results: z.array(BraveWebResultSchema).catch([]),
    })
    .nullable()
    .optional()
    .catch(undefined),
});

type BraveWebResult = z.infer<typeof BraveWebResultSchema>;

function buildBraveSearchUrl(
  baseUrl: string,
  { query, maxResults, freshness }: NormalizedSearchWebOptions,
): string {
  const url = new URL(baseUrl);

  url.searchParams.set(BRAVE_SEARCH.QUERY_PARAMS.QUERY, query);
  url.searchParams.set(BRAVE_SEARCH.QUERY_PARAMS.COUNT, String(maxResults));
  url.searchParams.set(BRAVE_SEARCH.QUERY_PARAMS.RESULT_FILTER, BRAVE_SEARCH.RESULT_FILTERS.WEB);

  if (freshness.trim()) {
    url.searchParams.set(BRAVE_SEARCH.QUERY_PARAMS.FRESHNESS, freshness);
  }

  return url.toString();
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim().length > 0);
}

export function normalizeBraveWebResult(result: BraveWebResult): WebSearchResult {
  const sourceName = firstNonEmpty(
    result.profile?.name,
    result.profile?.long_name,
    result.meta_url?.hostname,
    result.meta_url?.netloc,
  );
  const publishedAt = firstNonEmpty(result.page_age, result.age);

  return {
    title: result.title,
    url: result.url,
    description: result.description,
    ...(publishedAt ? { publishedAt } : {}),
    ...(sourceName ? { sourceName } : {}),
  };
}

function reserveBraveSearchCall(state: BraveSearchQuotaState, maxCallsPerRuntime: number): void {
  if (state.rateLimited) {
    throw new Error(BRAVE_SEARCH.ERRORS.RATE_LIMIT_CIRCUIT_OPEN);
  }

  if (state.calls >= maxCallsPerRuntime) {
    throw new Error(BRAVE_SEARCH.ERRORS.QUOTA_EXCEEDED);
  }

  state.calls += 1;
}

export function createBraveSearchClient(
  dependencies: BraveSearchClientDependencies = {},
): BraveSearchClient {
  const loadConfig = dependencies.loadConfig ?? getBraveSearchConfig;
  const transport = dependencies.transport ?? fetchWithRetry;
  const quotaState: BraveSearchQuotaState = { calls: 0, rateLimited: false };

  return {
    async searchWeb(options) {
      const config = loadConfig();
      reserveBraveSearchCall(quotaState, config.maxCallsPerRuntime);
      const response = await transport(
        buildBraveSearchUrl(config.BRAVE_SEARCH_URL, normalizeOptions(options)),
        {
          signal: options.signal,
          headers: {
            accept: HTTP.JSON_ACCEPT,
            [BRAVE_SEARCH.HEADERS.SUBSCRIPTION_TOKEN]: config.BRAVE_SEARCH_API_KEY,
            [HTTP.USER_AGENT_HEADER]: HTTP.USER_AGENT,
          },
        },
        {
          retries: BRAVE_SEARCH.RETRIES,
        },
      );

      if (!response.ok) {
        if (response.status === 429) {
          quotaState.rateLimited = true;
        }

        throw await buildHttpStatusError(BRAVE_SEARCH.ERRORS.HTTP_FAILED_PREFIX, response, {
          signal: options.signal,
        });
      }

      const parsed = BraveSearchResponseSchema.parse(
        await readResponseJson(response, { signal: options.signal }),
      );
      return (parsed.web?.results ?? []).map(normalizeBraveWebResult);
    },
  };
}

function normalizeOptions(options: WebSearchOptions): NormalizedSearchWebOptions {
  return {
    query: options.query,
    maxResults: options.maxResults ?? BRAVE_SEARCH.DEFAULT_MAX_RESULTS,
    freshness: options.freshness ?? "",
  };
}
