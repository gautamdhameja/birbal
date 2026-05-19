import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeUrl,
  rankDailyCandidates,
  toArxivCandidate,
  toHackerNewsCandidate,
} from "../src/daily/pipeline.js";
import { DAILY_READING, SOURCES } from "../src/constants.js";
import type { CandidateItem } from "../src/daily/types.js";

function candidate(overrides: Partial<CandidateItem>): CandidateItem {
  return {
    id: "test:https://example.com/",
    source: SOURCES.ARXIV,
    title: "Example",
    url: "https://example.com/",
    summary: "",
    publishedAt: "2026-05-16T10:00:00Z",
    raw: {},
    ...overrides,
  };
}

describe("daily reading pipeline", () => {
  it("uses the fixed daily topic list", () => {
    assert.deepEqual(
      [...DAILY_READING.TOPICS],
      [
        "LLM agents",
        "agent evaluation",
        "RAG systems",
        "local LLM inference",
        "llama.cpp",
        "vLLM",
        "AI engineering",
      ],
    );
  });

  it("normalizes candidate URLs before deduplication", () => {
    assert.equal(normalizeUrl(" https://example.com/path#section "), "https://example.com/path");
  });

  it("normalizes arXiv and Hacker News results into candidates", () => {
    assert.deepEqual(
      toArxivCandidate({
        title: "Agent Evaluation",
        url: "https://arxiv.org/abs/2605.12345v1",
        summary: "Evaluation summary",
        authors: ["Ada Lovelace"],
        published: "2026-05-16T10:00:00Z",
      }),
      {
        id: "arxiv:https://arxiv.org/abs/2605.12345v1",
        source: SOURCES.ARXIV,
        title: "Agent Evaluation",
        url: "https://arxiv.org/abs/2605.12345v1",
        summary: "Evaluation summary",
        publishedAt: "2026-05-16T10:00:00Z",
        raw: {
          title: "Agent Evaluation",
          url: "https://arxiv.org/abs/2605.12345v1",
          summary: "Evaluation summary",
          authors: ["Ada Lovelace"],
          published: "2026-05-16T10:00:00Z",
        },
      },
    );

    assert.deepEqual(
      toHackerNewsCandidate({
        title: "Local LLM Inference",
        url: "https://example.com/local-llm",
        hn_url: "https://news.ycombinator.com/item?id=123",
        points: 7,
        author: "pg",
        created_at: "2026-05-16T11:00:00Z",
      }),
      {
        id: "hackernews:https://example.com/local-llm",
        source: SOURCES.HACKER_NEWS,
        title: "Local LLM Inference",
        url: "https://example.com/local-llm",
        summary: "",
        publishedAt: "2026-05-16T11:00:00Z",
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
          source: SOURCES.HACKER_NEWS,
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
          source: SOURCES.HACKER_NEWS,
          title: "HN newer",
          url: "https://example.com/hn-newer",
          publishedAt: "2026-05-18T10:00:00Z",
        }),
        candidate({
          id: "arxiv-older",
          source: SOURCES.ARXIV,
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
