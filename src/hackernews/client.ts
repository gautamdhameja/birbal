import { z } from "zod";

import { HACKER_NEWS } from "../constants/hacker-news.js";
import { HTTP } from "../constants/runtime.js";
import { buildHttpStatusError, fetchWithTimeout, readResponseJson } from "../http/client.js";
import { getHackerNewsConfig } from "./config.js";

type HackerNewsSearchOptions = {
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

const HackerNewsHitSchema = z.object({
  author: z.string().catch(""),
  created_at: z.string().catch(""),
  objectID: z.string(),
  points: z.number().nullable().catch(null),
  title: z.string().nullable().catch(null),
  url: z.string().nullable().catch(null),
});

const HackerNewsSearchResponseSchema = z.object({
  hits: z.array(HackerNewsHitSchema),
});

type HackerNewsHit = z.infer<typeof HackerNewsHitSchema>;

function buildHackerNewsSearchUrl({ query, maxResults }: HackerNewsSearchOptions): string {
  const { HACKERNEWS_SEARCH_URL } = getHackerNewsConfig();
  const url = new URL(HACKERNEWS_SEARCH_URL);

  url.searchParams.set(HACKER_NEWS.QUERY_PARAMS.QUERY, query);
  url.searchParams.set(HACKER_NEWS.QUERY_PARAMS.TAGS, HACKER_NEWS.STORY_TAG);
  url.searchParams.set(HACKER_NEWS.QUERY_PARAMS.HITS_PER_PAGE, String(maxResults));

  return url.toString();
}

export function normalizeHackerNewsHit(hit: HackerNewsHit): HackerNewsStory {
  const hn_url = `${HACKER_NEWS.ITEM_URL_PREFIX}${hit.objectID}`;

  return {
    title: hit.title ?? "",
    url: hit.url ?? hn_url,
    hn_url,
    points: hit.points,
    author: hit.author,
    created_at: hit.created_at,
  };
}

export async function searchHackerNews(
  options: HackerNewsSearchOptions,
): Promise<HackerNewsStory[]> {
  const response = await fetchWithTimeout(buildHackerNewsSearchUrl(options), {
    signal: options.signal,
    headers: {
      accept: HTTP.JSON_ACCEPT,
      [HTTP.USER_AGENT_HEADER]: HTTP.USER_AGENT,
    },
  });

  if (!response.ok) {
    throw await buildHttpStatusError(HACKER_NEWS.ERRORS.HTTP_FAILED_PREFIX, response);
  }

  const parsed = HackerNewsSearchResponseSchema.parse(await readResponseJson(response));
  return parsed.hits.map(normalizeHackerNewsHit);
}
