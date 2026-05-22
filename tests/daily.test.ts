import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  listEnabledDailySourceConfigs,
  listDailySources,
  normalizeUrl,
  rankDailyCandidates,
  toArxivCandidate,
  toHackerNewsCandidate,
} from "../src/daily/pipeline.js";
import { CONTENT_FETCH_STATUSES, SOURCE_REGISTRY, SOURCES } from "../src/constants.js";
import type { CandidateItem } from "../src/daily/types.js";
import type { SourceRegistry } from "../src/config/sourceRegistry.js";

function candidate(overrides: Partial<CandidateItem>): CandidateItem {
  return {
    id: "test:https://example.com/",
    sourceId: SOURCES.ARXIV,
    sourceName: "arXiv",
    sourceType: SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC_FALLBACK,
    title: "Example",
    url: "https://example.com/",
    summary: "",
    publishedAt: "2026-05-16T10:00:00Z",
    discoveredAt: "2026-05-16T11:00:00Z",
    contentFetchStatus: CONTENT_FETCH_STATUSES.NOT_FETCHED,
    raw: {},
    ...overrides,
  };
}

function sourceRegistry(): SourceRegistry {
  return {
    sources: [
      {
        id: SOURCES.HACKER_NEWS,
        name: "Hacker News",
        domains: ["news.ycombinator.com"],
        priority: 1,
        sourceType: "community",
        searchQueries: ["LLM agents"],
        enabled: true,
      },
      {
        id: SOURCES.ARXIV,
        name: "arXiv",
        domains: ["arxiv.org"],
        priority: 2,
        sourceType: "academic_fallback",
        searchQueries: ["agent evaluation"],
        enabled: true,
      },
    ],
  };
}

describe("daily reading pipeline", () => {
  it("uses Hacker News only by default and marks arXiv as academic fallback", () => {
    assert.deepEqual(listDailySources(sourceRegistry()), [SOURCES.HACKER_NEWS]);
    assert.deepEqual(listDailySources(sourceRegistry(), true), [
      SOURCES.HACKER_NEWS,
      SOURCES.ARXIV,
    ]);
  });

  it("does not collect sources with a zero daily mix weight", () => {
    assert.deepEqual(
      listEnabledDailySourceConfigs(sourceRegistry(), true, {
        arxiv: 1,
        hackernews: 0,
      }).map((source) => source.id),
      [SOURCES.ARXIV],
    );
  });

  it("normalizes candidate URLs before deduplication", () => {
    assert.equal(normalizeUrl(" https://example.com/path#section "), "https://example.com/path");
  });

  it("normalizes arXiv and Hacker News results into candidates", () => {
    const arxivCandidate = toArxivCandidate({
      title: "Agent Evaluation",
      url: "https://arxiv.org/abs/2605.12345v1",
      summary: "Evaluation summary",
      authors: ["Ada Lovelace"],
      published: "2026-05-16T10:00:00Z",
    });

    assert.match(arxivCandidate.discoveredAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(
      { ...arxivCandidate, discoveredAt: "<dynamic>" },
      {
        id: "arxiv:https://arxiv.org/abs/2605.12345v1",
        sourceId: SOURCES.ARXIV,
        sourceName: "arXiv",
        sourceType: SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC_FALLBACK,
        title: "Agent Evaluation",
        url: "https://arxiv.org/abs/2605.12345v1",
        summary: "Evaluation summary",
        publishedAt: "2026-05-16T10:00:00Z",
        discoveredAt: "<dynamic>",
        contentFetchStatus: CONTENT_FETCH_STATUSES.NOT_FETCHED,
        raw: {
          title: "Agent Evaluation",
          url: "https://arxiv.org/abs/2605.12345v1",
          summary: "Evaluation summary",
          authors: ["Ada Lovelace"],
          published: "2026-05-16T10:00:00Z",
        },
      },
    );

    const hackerNewsCandidate = toHackerNewsCandidate({
      title: "Local LLM Inference",
      url: "https://example.com/local-llm",
      hn_url: "https://news.ycombinator.com/item?id=123",
      points: 7,
      author: "pg",
      created_at: "2026-05-16T11:00:00Z",
    });

    assert.match(hackerNewsCandidate.discoveredAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(
      { ...hackerNewsCandidate, discoveredAt: "<dynamic>" },
      {
        id: "hackernews:https://example.com/local-llm",
        sourceId: SOURCES.HACKER_NEWS,
        sourceName: "Hacker News",
        sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
        title: "Local LLM Inference",
        url: "https://example.com/local-llm",
        summary: "",
        publishedAt: "2026-05-16T11:00:00Z",
        discoveredAt: "<dynamic>",
        contentFetchStatus: CONTENT_FETCH_STATUSES.NOT_FETCHED,
        raw: {
          title: "Local LLM Inference",
          url: "https://example.com/local-llm",
          hn_url: "https://news.ycombinator.com/item?id=123",
          points: 7,
          author: "pg",
          created_at: "2026-05-16T11:00:00Z",
        },
      },
    );
  });

  it("ranks deterministically and keeps the top duplicate URL", () => {
    const ranked = rankDailyCandidates(
      [
        candidate({
          id: "older",
          title: "Older",
          url: "https://example.com/older",
          publishedAt: "2026-05-15T10:00:00Z",
        }),
        candidate({
          id: "first-duplicate",
          title: "First duplicate loses",
          url: "https://example.com/duplicate",
          publishedAt: "2026-05-16T10:00:00Z",
        }),
        candidate({
          id: "second-duplicate",
          title: "Second duplicate wins",
          url: "https://example.com/duplicate",
          publishedAt: "2026-05-17T10:00:00Z",
        }),
        candidate({
          id: "newer",
          title: "Newer",
          sourceId: SOURCES.HACKER_NEWS,
          sourceName: "Hacker News",
          sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
          url: "https://example.com/newer",
          publishedAt: "2026-05-16T12:00:00Z",
        }),
      ],
      2,
    );

    assert.deepEqual(
      ranked.map((item) => item.id),
      ["second-duplicate", "newer"],
    );
  });

  it("applies daily source mix when ranking candidates", () => {
    const ranked = rankDailyCandidates(
      [
        candidate({
          id: "hn-newer",
          sourceId: SOURCES.HACKER_NEWS,
          sourceName: "Hacker News",
          sourceType: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
          title: "HN newer",
          url: "https://example.com/hn-newer",
          publishedAt: "2026-05-18T10:00:00Z",
        }),
        candidate({
          id: "arxiv-older",
          sourceId: SOURCES.ARXIV,
          sourceName: "arXiv",
          sourceType: SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC_FALLBACK,
          title: "arXiv older",
          url: "https://example.com/arxiv-older",
          publishedAt: "2026-05-17T10:00:00Z",
        }),
      ],
      2,
      {
        arxiv: 1,
        hackernews: 0,
      },
    );

    assert.deepEqual(
      ranked.map((item) => item.id),
      ["arxiv-older"],
    );
  });
});
