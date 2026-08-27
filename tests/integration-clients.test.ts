// Purpose: Proves integration clients own isolated state and accept narrow runtime dependencies.
// Scope: Covers Brave, arXiv, Hacker News, and configured-source search without global mutation.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createArxivClient } from "../src/app/arxiv/client.js";
import { createBraveSearchClient } from "../src/app/brave-search/client.js";
import { SOURCE_REGISTRY } from "../src/app/constants/source-registry.js";
import { createHackerNewsClient } from "../src/app/hackernews/client.js";
import { createSourceDomainSearch } from "../src/app/source-search/domain.js";
import * as arxivClientModule from "../src/app/arxiv/client.js";
import * as braveClientModule from "../src/app/brave-search/client.js";
import * as hackerNewsClientModule from "../src/app/hackernews/client.js";
import * as sourceSearchModule from "../src/app/source-search/domain.js";
import type { FetchRetryOptions } from "../src/framework/network/fetch.js";

const braveConfig = {
  BRAVE_SEARCH_API_KEY: "test-key",
  BRAVE_SEARCH_URL: "https://api.search.brave.com/res/v1/web/search",
  BRAVE_SEARCH_MAX_CALLS_PER_PROCESS: 1,
};

describe("state-owning integration clients", () => {
  it("exposes factories without module-level default client operations", () => {
    assert.equal("searchArxiv" in arxivClientModule, false);
    assert.equal("searchWeb" in braveClientModule, false);
    assert.equal("searchHackerNews" in hackerNewsClientModule, false);
    assert.equal("searchSourceDomain" in sourceSearchModule, false);
  });

  it("keeps Brave quota and 429 circuit state isolated between client instances", async () => {
    let rateLimitedCalls = 0;
    let healthyCalls = 0;
    const rateLimited = createBraveSearchClient({
      loadConfig: () => braveConfig,
      transport: async () => {
        rateLimitedCalls += 1;
        return new Response("rate limit", { status: 429 });
      },
    });
    const healthy = createBraveSearchClient({
      loadConfig: () => braveConfig,
      transport: async () => {
        healthyCalls += 1;
        return new Response(JSON.stringify({ web: { results: [] } }), { status: 200 });
      },
    });

    await assert.rejects(() => rateLimited.searchWeb({ query: "agents" }), /HTTP 429/);
    await assert.rejects(
      () => rateLimited.searchWeb({ query: "agents" }),
      /circuit is open after a rate limit response/,
    );
    assert.deepEqual(await healthy.searchWeb({ query: "agents" }), []);
    await assert.rejects(() => healthy.searchWeb({ query: "agents" }), /process quota exceeded/);
    assert.equal(rateLimitedCalls, 1);
    assert.equal(healthyCalls, 1);
  });

  it("reinitializes arXiv limiter state for each client and uses injected request dependencies", async () => {
    const firstDelays: number[] = [];
    const secondDelays: number[] = [];
    let firstNow = 1_000;
    let secondNow = 10_000;
    const requestedUrls: string[] = [];

    function createTransport() {
      return async (
        input: string | URL,
        _init: RequestInit = {},
        options: FetchRetryOptions = {},
      ): Promise<Response> => {
        requestedUrls.push(String(input));
        await options.beforeAttempt?.(1);
        return new Response("<feed></feed>", { status: 200 });
      };
    }

    const first = createArxivClient({
      loadConfig: () => ({ ARXIV_QUERY_URL: "https://export.arxiv.org/api/query" }),
      now: () => firstNow,
      delay: async (ms) => {
        firstDelays.push(ms);
        firstNow += ms;
      },
      transport: createTransport(),
    });
    const second = createArxivClient({
      loadConfig: () => ({ ARXIV_QUERY_URL: "https://export.arxiv.org/api/query" }),
      now: () => secondNow,
      delay: async (ms) => {
        secondDelays.push(ms);
        secondNow += ms;
      },
      transport: createTransport(),
    });

    await first.searchArxiv({ query: "agent evaluation", maxResults: 2 });
    await second.searchArxiv({ query: "agent evaluation", maxResults: 2 });

    assert.deepEqual(firstDelays, [3_000]);
    assert.deepEqual(secondDelays, [3_000]);
    assert.equal(requestedUrls.length, 4);
    const firstUrl = new URL(requestedUrls[0] ?? "");
    assert.equal(firstUrl.searchParams.get("search_query"), 'all:"agent evaluation"');
    assert.equal(firstUrl.searchParams.get("max_results"), "2");
  });

  it("uses an injected Hacker News transport and config loader", async () => {
    let requestedUrl = "";
    const client = createHackerNewsClient({
      loadConfig: () => ({ HACKERNEWS_SEARCH_URL: "https://hn.algolia.com/api/v1/search_by_date" }),
      transport: async (input) => {
        requestedUrl = String(input);
        return new Response(
          JSON.stringify({
            hits: [
              {
                author: "pg",
                created_at: "2026-01-01T00:00:00Z",
                objectID: "42",
                points: 10,
                title: "Agent systems",
                url: null,
              },
            ],
          }),
          { status: 200 },
        );
      },
    });

    const stories = await client.searchHackerNews({ query: "agents", maxResults: 3 });

    assert.equal(new URL(requestedUrl).searchParams.get("query"), "agents");
    assert.equal(new URL(requestedUrl).searchParams.get("hitsPerPage"), "3");
    assert.equal(stories[0]?.url, "https://news.ycombinator.com/item?id=42");
  });
});

describe("configured source search", () => {
  it("uses the injected web-search port and clock deterministically", async () => {
    const queries: string[] = [];
    const searchSourceDomain = createSourceDomainSearch({
      loadSourceRegistry: () => ({
        sources: [
          {
            id: "enterprise-ai",
            name: "Enterprise AI",
            domains: ["example.com"],
            sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
            enabled: true,
          },
        ],
      }),
      searchWeb: async (options) => {
        queries.push(options.query);
        return [
          {
            title: "Agent evaluation",
            url: "https://example.com/report#notes",
            description: "A field report.",
            publishedAt: "2026-05-20T00:00:00Z",
          },
        ];
      },
      now: () => new Date("2026-08-27T09:15:00.000Z"),
    });

    assert.deepEqual(
      await searchSourceDomain({ sourceId: "enterprise-ai", query: "agents", maxResults: 1 }),
      [
        {
          id: "enterprise-ai:https://example.com/report",
          sourceId: "enterprise-ai",
          sourceName: "Enterprise AI",
          sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
          title: "Agent evaluation",
          url: "https://example.com/report",
          summary: "A field report.",
          publishedAt: "2026-05-20T00:00:00Z",
          discoveredAt: "2026-08-27T09:15:00.000Z",
        },
      ],
    );
    assert.deepEqual(queries, ["agents site:example.com"]);
  });
});
