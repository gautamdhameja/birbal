import { z } from "zod";

import { BIRBAL_USER_AGENT } from "../http/headers.js";
import { getHackerNewsConfig } from "./config.js";

type HackerNewsSearchOptions = {
  query: string;
  maxResults: number;
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

  url.searchParams.set("query", query);
  url.searchParams.set("tags", "story");
  url.searchParams.set("hitsPerPage", String(maxResults));

  return url.toString();
}

export function normalizeHackerNewsHit(hit: HackerNewsHit): HackerNewsStory {
  const hn_url = `https://news.ycombinator.com/item?id=${hit.objectID}`;

  return {
    title: hit.title ?? "",
    url: hit.url ?? hn_url,
    hn_url,
    points: hit.points,
    author: hit.author,
    created_at: hit.created_at,
  };
}

export async function searchHackerNews(options: HackerNewsSearchOptions): Promise<HackerNewsStory[]> {
  const response = await fetch(buildHackerNewsSearchUrl(options), {
    headers: {
      accept: "application/json",
      "user-agent": BIRBAL_USER_AGENT,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "<failed to read response body>");
    throw new Error(
      `Hacker News search request failed with HTTP ${response.status} ${response.statusText}: ${body}`,
    );
  }

  const parsed = HackerNewsSearchResponseSchema.parse(await response.json());
  return parsed.hits.map(normalizeHackerNewsHit);
}
