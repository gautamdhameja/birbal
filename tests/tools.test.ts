import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildArxivSearchQuery, parseArxivAtomFeed } from "../src/arxiv/client.js";
import { normalizeBraveWebResult, searchWeb } from "../src/brave-search/client.js";
import { CONTENT_FETCH_STATUSES, HTTP, SOURCE_REGISTRY } from "../src/constants.js";
import { normalizeHackerNewsHit } from "../src/hackernews/client.js";
import { searchSourceDomain } from "../src/source-search/domain.js";
import { formatLocalIsoString } from "../src/tools/get-time.js";
import { listTools, renderToolsForPrompt } from "../src/tools/registry.js";
import { runTool } from "../src/tools/runner.js";
import { fetchUrlText } from "../src/url-text/client.js";
import { extractUrlText } from "../src/url-text/extract.js";

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
}

function assertString(value: unknown): asserts value is string {
  assert.equal(typeof value, "string");
}

const publicHostResolver = async () => [{ address: "93.184.216.34", family: 4 as const }];

describe("tool registry", () => {
  it("formats local ISO timestamps with an explicit timezone offset", () => {
    assert.match(
      formatLocalIsoString(new Date()),
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/,
    );
  });

  it("lists the get_time tool", () => {
    assert.deepEqual(
      listTools().map((tool) => tool.name),
      [
        "get_time",
        "search_arxiv",
        "search_hackernews",
        "search_web",
        "search_source_domain",
        "fetch_url_text",
      ],
    );
  });

  it("renders tool metadata for the system prompt", () => {
    const renderedTools = renderToolsForPrompt();

    assert.match(renderedTools, /name: get_time/);
    assert.match(renderedTools, /description: Get the current local time as an ISO string\./);
    assert.match(
      renderedTools,
      /args: \{"type":"object","properties":\{\},"additionalProperties":false\}/,
    );
    assert.match(renderedTools, /name: search_arxiv/);
    assert.match(renderedTools, /description: Search recent arXiv papers by query\./);
    assert.match(renderedTools, /"required":\["query"\]/);
    assert.match(renderedTools, /name: search_hackernews/);
    assert.match(renderedTools, /description: Search recent Hacker News stories by query\./);
    assert.match(renderedTools, /name: search_web/);
    assert.match(renderedTools, /description: Search the web with Brave Search by query\./);
    assert.match(renderedTools, /name: search_source_domain/);
    assert.match(
      renderedTools,
      /description: Search a configured source domain with Brave Search\./,
    );
    assert.match(renderedTools, /name: fetch_url_text/);
    assert.match(
      renderedTools,
      /description: Fetch a URL and extract readable article or report text\./,
    );
  });

  it("parses arXiv Atom search results", () => {
    const papers = parseArxivAtomFeed(`
      <?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <id>http://arxiv.org/abs/2501.12345v1</id>
          <updated>2025-01-03T00:00:00Z</updated>
          <published>2025-01-02T00:00:00Z</published>
          <title>
            Example   Agent Evaluation Paper
          </title>
          <summary>
            This paper evaluates LLM agents.
          </summary>
          <author>
            <name>Ada Lovelace</name>
          </author>
          <author>
            <name>Alan Turing</name>
          </author>
          <link href="http://arxiv.org/abs/2501.12345v1" rel="alternate" type="text/html"/>
        </entry>
      </feed>
    `);

    assert.deepEqual(papers, [
      {
        title: "Example Agent Evaluation Paper",
        url: "http://arxiv.org/abs/2501.12345v1",
        summary: "This paper evaluates LLM agents.",
        authors: ["Ada Lovelace", "Alan Turing"],
        published: "2025-01-02T00:00:00Z",
      },
    ]);
  });

  it("builds precise arXiv queries for natural language searches", () => {
    assert.equal(buildArxivSearchQuery("LLM agent evaluation"), 'all:"LLM agent evaluation"');
    assert.equal(
      buildArxivSearchQuery("LLM agent evaluation", "all-terms"),
      "all:LLM AND all:agent AND all:evaluation",
    );
  });

  it("normalizes Hacker News stories", () => {
    assert.deepEqual(
      normalizeHackerNewsHit({
        author: "pg",
        created_at: "2026-05-16T10:00:00Z",
        objectID: "123",
        points: 42,
        title: "llama.cpp local inference",
        url: "https://example.com/story",
      }),
      {
        title: "llama.cpp local inference",
        url: "https://example.com/story",
        hn_url: "https://news.ycombinator.com/item?id=123",
        points: 42,
        author: "pg",
        created_at: "2026-05-16T10:00:00Z",
      },
    );
  });

  it("uses the Hacker News item URL when a story has no external URL", () => {
    assert.deepEqual(
      normalizeHackerNewsHit({
        author: "pg",
        created_at: "2026-05-16T10:00:00Z",
        objectID: "123",
        points: null,
        title: "Ask HN: Local LLM inference",
        url: null,
      }),
      {
        title: "Ask HN: Local LLM inference",
        url: "https://news.ycombinator.com/item?id=123",
        hn_url: "https://news.ycombinator.com/item?id=123",
        points: null,
        author: "pg",
        created_at: "2026-05-16T10:00:00Z",
      },
    );
  });

  it("normalizes Brave Search web results", () => {
    const raw = {
      title: "Brave Search API",
      url: "https://api.search.brave.com/",
      description: "Search the web.",
      page_age: "2026-05-21T12:00:00Z",
      profile: {
        name: "Brave",
      },
    };

    assert.deepEqual(normalizeBraveWebResult(raw), {
      title: "Brave Search API",
      url: "https://api.search.brave.com/",
      description: "Search the web.",
      publishedAt: "2026-05-21T12:00:00Z",
      sourceName: "Brave",
      raw,
    });
  });

  it("searches Brave Search with raw fetch", async () => {
    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.BRAVE_SEARCH_API_KEY;
    let requestedUrl = "";
    let requestedToken = "";

    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    globalThis.fetch = ((input, init) => {
      requestedUrl = String(input);
      requestedToken = new Headers(init?.headers).get("X-Subscription-Token") ?? "";

      return Promise.resolve(
        new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: "Enterprise AI agents",
                  url: "https://example.com/agents",
                  description: "A field report.",
                  age: "2026-05-20T00:00:00Z",
                  meta_url: {
                    hostname: "example.com",
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }) as typeof fetch;

    try {
      assert.deepEqual(
        await searchWeb({
          query: "LLM agents",
          maxResults: 3,
          freshness: "pw",
        }),
        [
          {
            title: "Enterprise AI agents",
            url: "https://example.com/agents",
            description: "A field report.",
            publishedAt: "2026-05-20T00:00:00Z",
            sourceName: "example.com",
            raw: {
              title: "Enterprise AI agents",
              url: "https://example.com/agents",
              description: "A field report.",
              age: "2026-05-20T00:00:00Z",
              meta_url: {
                hostname: "example.com",
              },
            },
          },
        ],
      );

      const url = new URL(requestedUrl);
      assert.equal(url.hostname, "api.search.brave.com");
      assert.equal(url.searchParams.get("q"), "LLM agents");
      assert.equal(url.searchParams.get("count"), "3");
      assert.equal(url.searchParams.get("freshness"), "pw");
      assert.equal(url.searchParams.get("result_filter"), "web");
      assert.equal(requestedToken, "test-key");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey === undefined) {
        delete process.env.BRAVE_SEARCH_API_KEY;
      } else {
        process.env.BRAVE_SEARCH_API_KEY = originalApiKey;
      }
    }
  });

  it("does not retry Brave Search failures that could consume quota", async () => {
    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.BRAVE_SEARCH_API_KEY;
    let calls = 0;

    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    globalThis.fetch = (() => {
      calls += 1;

      return Promise.resolve(new Response("rate limit", { status: 429 }));
    }) as typeof fetch;

    try {
      await assert.rejects(
        () =>
          searchWeb({
            query: "LLM agents",
            maxResults: 3,
          }),
        /Brave Search request failed with HTTP 429/,
      );
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey === undefined) {
        delete process.env.BRAVE_SEARCH_API_KEY;
      } else {
        process.env.BRAVE_SEARCH_API_KEY = originalApiKey;
      }
    }
  });

  it("searches each configured source domain and deduplicates by canonical URL", async () => {
    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.BRAVE_SEARCH_API_KEY;
    const requestedQueries: string[] = [];

    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    globalThis.fetch = ((input) => {
      const url = new URL(String(input));
      requestedQueries.push(url.searchParams.get("q") ?? "");

      return Promise.resolve(
        new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: "Agent evaluation field notes",
                  url: "https://example.com/agents#comments",
                  description: "Practical notes on agent evals.",
                  age: "2026-05-20T00:00:00Z",
                },
                {
                  title: "Agent evaluation field notes duplicate",
                  url: "https://example.com/agents",
                  description: "Duplicate URL from another domain query.",
                  age: "2026-05-21T00:00:00Z",
                },
                {
                  title: "Off-domain result",
                  url: "https://other.example/agents",
                  description: "This should not be returned for example.com.",
                  age: "2026-05-21T00:00:00Z",
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }) as typeof fetch;

    try {
      const results = await searchSourceDomain(
        {
          sourceId: "enterprise-ai",
          query: "agent evaluation",
          maxResults: 10,
        },
        {
          sourceRegistry: {
            sources: [
              {
                id: "enterprise-ai",
                name: "Enterprise AI",
                domains: ["example.com", "docs.example.com"],
                priority: 1,
                sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
                searchQueries: ["agent evaluation"],
                enabled: true,
              },
            ],
          },
        },
      );

      assert.match(results[0]?.discoveredAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
      assert.deepEqual(
        results.map((result) => ({ ...result, discoveredAt: "<dynamic>" })),
        [
          {
            id: "enterprise-ai:https://example.com/agents",
            sourceId: "enterprise-ai",
            sourceName: "Enterprise AI",
            sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
            title: "Agent evaluation field notes",
            url: "https://example.com/agents",
            summary: "Practical notes on agent evals.",
            publishedAt: "2026-05-20T00:00:00Z",
            discoveredAt: "<dynamic>",
            contentFetchStatus: CONTENT_FETCH_STATUSES.NOT_FETCHED,
            raw: {
              title: "Agent evaluation field notes",
              url: "https://example.com/agents#comments",
              description: "Practical notes on agent evals.",
              age: "2026-05-20T00:00:00Z",
            },
          },
        ],
      );

      assert.deepEqual(requestedQueries, [
        "agent evaluation site:example.com",
        "agent evaluation site:docs.example.com",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey === undefined) {
        delete process.env.BRAVE_SEARCH_API_KEY;
      } else {
        process.env.BRAVE_SEARCH_API_KEY = originalApiKey;
      }
    }
  });

  it("extracts URL text from HTML while stripping noisy sections", () => {
    assert.deepEqual(
      extractUrlText(
        `
          <html>
            <head>
              <link rel="canonical" href="https://example.com/report" />
              <title>Example &amp; Report</title>
              <style>body { color: red; }</style>
            </head>
            <body>
              <nav>Navigation</nav>
              <article>
                <h1>Report title</h1>
                <p>This is the useful report text.</p>
              </article>
              <footer>Footer</footer>
              <script>window.bad = true;</script>
            </body>
          </html>
        `,
        12000,
      ),
      {
        title: "Example & Report",
        plainText: "Report title This is the useful report text.",
        canonicalUrl: "https://example.com/report",
        detectedPaywall: false,
        contentLength: 44,
      },
    );
  });

  it("handles malformed HTML numeric entities without throwing", () => {
    assert.deepEqual(
      extractUrlText(
        `
          <html>
            <head><title>&#9999999999;</title></head>
            <body><main><p>&#x110000; Useful text.</p></main></body>
          </html>
        `,
        12000,
      ),
      {
        title: "�",
        plainText: "� Useful text.",
        canonicalUrl: undefined,
        detectedPaywall: false,
        contentLength: 14,
      },
    );
  });

  it("fetches URL text with raw fetch", async () => {
    let requestedUrl = "";

    const transport = async (input: string | URL): Promise<Response> => {
      requestedUrl = String(input);
      return new Response(
        `
            <html>
              <head><title>Paywalled report</title></head>
              <body>
                <main>
                  <p>Subscribe to continue reading this report.</p>
                  <p>Visible teaser text.</p>
                </main>
              </body>
            </html>
          `,
        { status: 200, headers: { "content-type": "text/html" } },
      );
    };

    assert.deepEqual(
      await fetchUrlText({
        url: "https://example.com/report",
        maxChars: 30,
        hostResolver: publicHostResolver,
        transport,
      }),
      {
        url: "https://example.com/report",
        title: "Paywalled report",
        plainText: "Subscribe to continue reading",
        detectedPaywall: true,
        contentLength: 29,
      },
    );
    assert.equal(requestedUrl, "https://example.com/report");
  });

  it("rejects unsafe fetch URL hosts before making a request", async () => {
    const originalFetch = globalThis.fetch;
    let called = false;

    globalThis.fetch = (() => {
      called = true;
      return Promise.resolve(new Response("", { status: 200 }));
    }) as typeof fetch;

    try {
      await assert.rejects(
        () => fetchUrlText({ url: "http://[::1]/metadata" }),
        new RegExp(HTTP.ERRORS.UNSAFE_HTTP_URL),
      );
      assert.equal(called, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects unsafe redirect targets before following them", async () => {
    const requestedUrls: string[] = [];

    const transport = async (input: string | URL): Promise<Response> => {
      requestedUrls.push(String(input));

      return new Response("", {
        status: 302,
        headers: {
          location: "http://127.0.0.1/internal",
        },
      });
    };

    await assert.rejects(
      () =>
        fetchUrlText({
          url: "https://example.com/report",
          hostResolver: publicHostResolver,
          transport,
        }),
      new RegExp(HTTP.ERRORS.UNSAFE_HTTP_URL),
    );
    assert.deepEqual(requestedUrls, ["https://example.com/report"]);
  });

  it("uses the final redirected URL when extracting canonical URLs", async () => {
    const transport = async (input: string | URL): Promise<Response> => {
      const requestedUrl = String(input);
      if (requestedUrl === "https://example.com/report") {
        return new Response("", {
          status: 302,
          headers: {
            location: "/final",
          },
        });
      }

      return new Response(
        `
            <html>
              <head>
                <title>Redirected report</title>
                <link rel="canonical" href="/canonical" />
              </head>
              <body><main><p>Final report body.</p></main></body>
            </html>
          `,
        { status: 200, headers: { "content-type": "text/html" } },
      );
    };

    assert.deepEqual(
      await fetchUrlText({
        url: "https://example.com/report",
        hostResolver: publicHostResolver,
        transport,
      }),
      {
        url: "https://example.com/final",
        title: "Redirected report",
        plainText: "Final report body.",
        canonicalUrl: "https://example.com/canonical",
        detectedPaywall: false,
        contentLength: 18,
      },
    );
  });

  it("runs get_time", async () => {
    const result = await runTool("get_time", {});

    assertRecord(result);
    assert.ok("now" in result);
    const now = result.now;
    assertString(now);
    assert.match(now, /^\d{4}-\d{2}-\d{2}T/);
    assert.doesNotMatch(now, /Z$/);
    assert.doesNotThrow(() => new Date(now).toISOString());
  });

  it("returns a structured error for unknown tools", async () => {
    assert.deepEqual(await runTool("missing", {}), {
      error: "Unknown tool: missing",
    });
  });

  it("returns a structured error for invalid args", async () => {
    const result = await runTool("get_time", { extra: true });

    assertRecord(result);
    assert.ok("error" in result);
    const error = result.error;
    assertString(error);
    assert.match(error, /Invalid args for tool "get_time"/);
  });

  it("validates search_arxiv args before making a request", async () => {
    const result = await runTool("search_arxiv", { query: "agents", max_results: 11 });

    assertRecord(result);
    assert.ok("error" in result);
    const error = result.error;
    assertString(error);
    assert.match(error, /Invalid args for tool "search_arxiv"/);
  });

  it("validates search_hackernews args before making a request", async () => {
    const result = await runTool("search_hackernews", { query: "llama.cpp", max_results: 11 });

    assertRecord(result);
    assert.ok("error" in result);
    const error = result.error;
    assertString(error);
    assert.match(error, /Invalid args for tool "search_hackernews"/);
  });

  it("validates search_web args before making a request", async () => {
    const result = await runTool("search_web", { query: "agents", max_results: 21 });

    assertRecord(result);
    assert.ok("error" in result);
    const error = result.error;
    assertString(error);
    assert.match(error, /Invalid args for tool "search_web"/);
  });

  it("validates search_source_domain args before making a request", async () => {
    const result = await runTool("search_source_domain", {
      sourceId: "hackernews",
      query: "agents",
      max_results: 21,
    });

    assertRecord(result);
    assert.ok("error" in result);
    const error = result.error;
    assertString(error);
    assert.match(error, /Invalid args for tool "search_source_domain"/);
  });

  it("returns a structured error for unknown source domain sources", async () => {
    const result = await runTool("search_source_domain", {
      sourceId: "missing-source",
      query: "agents",
    });

    assertRecord(result);
    assert.ok("error" in result);
    const error = result.error;
    assertString(error);
    assert.equal(error, "Unknown source: missing-source");
  });

  it("validates fetch_url_text args before making a request", async () => {
    const result = await runTool("fetch_url_text", {
      url: "https://example.com/report",
      max_chars: 30001,
    });

    assertRecord(result);
    assert.ok("error" in result);
    const error = result.error;
    assertString(error);
    assert.match(error, /Invalid args for tool "fetch_url_text"/);
  });

  it("returns a clear error when the Brave Search API key is missing", async () => {
    const originalApiKey = process.env.BRAVE_SEARCH_API_KEY;
    delete process.env.BRAVE_SEARCH_API_KEY;

    try {
      const result = await runTool("search_web", { query: "agents" });

      assertRecord(result);
      assert.ok("error" in result);
      const error = result.error;
      assertString(error);
      assert.equal(error, "BRAVE_SEARCH_API_KEY is required to use search_web.");
    } finally {
      if (originalApiKey !== undefined) {
        process.env.BRAVE_SEARCH_API_KEY = originalApiKey;
      }
    }
  });
});
