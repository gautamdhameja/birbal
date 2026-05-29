// Purpose: Implements the Brave Search integration: client.
// Scope: Contains quota-aware raw HTTP search client behavior.

import { z } from "zod";

import { BRAVE_SEARCH } from "../constants/brave-search.js";
import { HTTP } from "../constants/runtime.js";
import { fetchWithRetry } from "../framework/network/fetch.js";
import { buildHttpStatusError, readResponseJson } from "../http/client.js";
import { getBraveSearchConfig } from "./config.js";

export type SearchWebOptions = {
  query: string;
  maxResults?: number;
  freshness?: string;
  signal?: AbortSignal;
};

export type SearchWebResult = {
  title: string;
  url: string;
  description: string;
  publishedAt?: string;
  sourceName?: string;
  raw: unknown;
};

type NormalizedSearchWebOptions = {
  query: string;
  maxResults: number;
  freshness: string;
};

type BraveSearchQuotaState = {
  calls: number;
  rateLimited: boolean;
};

const quotaState: BraveSearchQuotaState = {
  calls: 0,
  rateLimited: false,
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

export function normalizeBraveWebResult(result: BraveWebResult): SearchWebResult {
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
    raw: result,
  };
}

function reserveBraveSearchCall(maxCalls: number): void {
  if (quotaState.rateLimited) {
    throw new Error(BRAVE_SEARCH.ERRORS.RATE_LIMIT_CIRCUIT_OPEN);
  }

  if (quotaState.calls >= maxCalls) {
    throw new Error(BRAVE_SEARCH.ERRORS.QUOTA_EXCEEDED);
  }

  quotaState.calls += 1;
}

export function resetBraveSearchQuotaForTests(): void {
  quotaState.calls = 0;
  quotaState.rateLimited = false;
}

export async function searchWeb(options: SearchWebOptions): Promise<SearchWebResult[]> {
  const config = getBraveSearchConfig();
  reserveBraveSearchCall(config.BRAVE_SEARCH_MAX_CALLS_PER_PROCESS);
  const response = await fetchWithRetry(
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

    throw await buildHttpStatusError(BRAVE_SEARCH.ERRORS.HTTP_FAILED_PREFIX, response);
  }

  const parsed = BraveSearchResponseSchema.parse(await readResponseJson(response));
  return (parsed.web?.results ?? []).map(normalizeBraveWebResult);
}

function normalizeOptions(options: SearchWebOptions): NormalizedSearchWebOptions {
  return {
    query: options.query,
    maxResults: options.maxResults ?? BRAVE_SEARCH.DEFAULT_MAX_RESULTS,
    freshness: options.freshness ?? "",
  };
}
