import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildArxivSearchQuery, parseArxivAtomFeed } from "../src/arxiv/client.js";
import { normalizeHackerNewsHit } from "../src/hackernews/client.js";
import { formatLocalIsoString } from "../src/tools/get-time.js";
import { listTools, renderToolsForPrompt } from "../src/tools/registry.js";
import { runTool } from "../src/tools/runner.js";

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
}

function assertString(value: unknown): asserts value is string {
  assert.equal(typeof value, "string");
}

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
      ["get_time", "search_arxiv", "search_hackernews"],
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
});
