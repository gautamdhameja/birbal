import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { SOURCES } from "../src/constants.js";
import { getScore, initDb, upsertItem, upsertScore } from "../src/db/items.js";
import { runDailyReading } from "../src/daily/job.js";
import type { CandidateItem, ItemScore } from "../src/daily/types.js";
import type { UserPreferences } from "../src/memory/types.js";

function dbPath(): string {
  return join(mkdtempSync(join(tmpdir(), "birbal-daily-job-")), "agent.db");
}

function candidate(overrides: Partial<CandidateItem> = {}): CandidateItem {
  return {
    id: "arxiv:https://example.com/item",
    source: SOURCES.ARXIV,
    title: "Example Item",
    url: "https://example.com/item",
    summary: "summary",
    publishedAt: "2026-05-16T10:00:00Z",
    raw: {},
    ...overrides,
  };
}

function score(overrides: Partial<ItemScore> = {}): ItemScore {
  return {
    relevance: 7,
    technical_depth: 7,
    novelty: 7,
    practicality: 7,
    reason: "Useful.",
    finalScore: 7,
    ...overrides,
  };
}

function preferences(): UserPreferences {
  return {
    interests: ["LLM agents"],
    avoid: [],
    preferredDifficulty: "advanced",
    dailyMix: {
      arxiv: 1,
      hackernews: 0,
    },
  };
}

describe("daily reading job", () => {
  it("scores using the persisted item ID when an existing URL has a different candidate ID", async () => {
    const path = dbPath();
    const existingItem = candidate({
      id: "hackernews:https://example.com/item",
      source: SOURCES.HACKER_NEWS,
    });
    const currentCandidate = candidate();

    initDb(path);
    upsertItem(existingItem);

    const result = await runDailyReading({
      initDb: () => initDb(path),
      loadPreferences: preferences,
      collectCandidates: async () => ({ candidates: [currentCandidate], errors: [] }),
      scoreItem: async () => score(),
      saveDigest: () => "digest.md",
    });

    assert.equal(result.failed, false);
    assert.deepEqual(result.scoreErrors, []);
    assert.notEqual(getScore(existingItem.id), null);
    assert.equal(result.topScores[0]?.id, existingItem.id);
  });

  it("ranks the digest from current run items instead of all historical scores", async () => {
    const path = dbPath();
    const oldItem = candidate({
      id: "arxiv:https://example.com/old",
      title: "Old",
      url: "https://example.com/old",
    });
    const currentCandidate = candidate({
      id: "arxiv:https://example.com/current",
      title: "Current",
      url: "https://example.com/current",
    });

    initDb(path);
    upsertItem(oldItem);
    upsertScore(oldItem.id, score({ finalScore: 10 }));

    const result = await runDailyReading({
      initDb: () => initDb(path),
      loadPreferences: preferences,
      collectCandidates: async () => ({ candidates: [currentCandidate], errors: [] }),
      scoreItem: async () => score({ finalScore: 5 }),
      saveDigest: () => "digest.md",
    });

    assert.equal(result.failed, false);
    assert.deepEqual(
      result.topScores.map((item) => item.id),
      [currentCandidate.id],
    );
  });

  it("marks the run as failed when no candidates are collected", async () => {
    const path = dbPath();
    const result = await runDailyReading({
      initDb: () => initDb(path),
      loadPreferences: preferences,
      collectCandidates: async () => ({ candidates: [], errors: [] }),
    });

    assert.equal(result.failed, true);
    assert.equal(result.digestPath, null);
  });
});
