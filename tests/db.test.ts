import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { SOURCES } from "../src/constants.js";
import {
  closeDb,
  getItemByUrl,
  getScore,
  initDb,
  itemExistsByUrl,
  listRecentItems,
  listTopScoredItems,
  listTopScoredItemsByIds,
  upsertItem,
  upsertScore,
} from "../src/db/items.js";
import type { CandidateItem, ItemScore } from "../src/daily/types.js";

function item(overrides: Partial<CandidateItem>): CandidateItem {
  return {
    id: "test:https://example.com/item",
    source: SOURCES.ARXIV,
    title: "Example Item",
    url: "https://example.com/item",
    summary: "summary",
    publishedAt: "2026-05-16T10:00:00Z",
    raw: { source: "test" },
    ...overrides,
  };
}

function score(overrides: Partial<ItemScore> = {}): ItemScore {
  return {
    relevance: 8,
    technical_depth: 7,
    novelty: 6,
    practicality: 9,
    reason: "Useful technical item.",
    finalScore: 7.75,
    ...overrides,
  };
}

describe("SQLite item persistence", () => {
  it("initializes the schema, upserts items, checks URLs, and lists recent items", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "birbal-db-")), "agent.db");
    initDb(dbPath);

    assert.equal(itemExistsByUrl("https://example.com/item"), false);

    upsertItem(item({ title: "Original" }));
    assert.equal(itemExistsByUrl("https://example.com/item"), true);

    upsertItem(item({ title: "Updated", summary: "updated summary" }));

    assert.equal(getItemByUrl("https://example.com/item")?.title, "Updated");

    const recentItems = listRecentItems(10);
    assert.deepEqual(recentItems[0], {
      id: "test:https://example.com/item",
      source: SOURCES.ARXIV,
      title: "Updated",
      url: "https://example.com/item",
      summary: "updated summary",
      publishedAt: "2026-05-16T10:00:00Z",
      raw: { source: "test" },
    });
  });

  it("rejects invalid list limits", () => {
    assert.throws(() => listRecentItems(0), /positive integer/);
  });

  it("upserts scores, gets scores, and lists top scored items", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "birbal-db-")), "agent.db");
    initDb(dbPath);

    const lowerRankedItem = item({
      id: "test:https://example.com/lower",
      title: "Lower Ranked",
      url: "https://example.com/lower",
    });
    const higherRankedItem = item({
      id: "test:https://example.com/higher",
      title: "Higher Ranked",
      url: "https://example.com/higher",
    });

    upsertItem(lowerRankedItem);
    upsertItem(higherRankedItem);

    upsertScore(lowerRankedItem.id, score({ finalScore: 6.5 }));
    assert.deepEqual(getScore(lowerRankedItem.id), score({ finalScore: 6.5 }));

    upsertScore(lowerRankedItem.id, score({ reason: "Updated reason.", finalScore: 7 }));
    upsertScore(higherRankedItem.id, score({ finalScore: 9 }));

    assert.deepEqual(
      getScore(lowerRankedItem.id),
      score({ reason: "Updated reason.", finalScore: 7 }),
    );
    assert.equal(getScore("missing"), null);

    const topScoredItems = listTopScoredItems(1);
    assert.equal(topScoredItems.length, 1);
    assert.equal(topScoredItems[0]?.id, higherRankedItem.id);
    assert.equal(topScoredItems[0]?.score.finalScore, 9);

    const scopedTopScoredItems = listTopScoredItemsByIds([lowerRankedItem.id], 10);
    assert.equal(scopedTopScoredItems.length, 1);
    assert.equal(scopedTopScoredItems[0]?.id, lowerRankedItem.id);
  });

  it("rejects invalid scored item list limits", () => {
    assert.throws(() => listTopScoredItems(0), /positive integer/);
  });

  it("reinitializes when a different database path is requested", () => {
    const firstDbPath = join(mkdtempSync(join(tmpdir(), "birbal-db-")), "agent.db");
    const secondDbPath = join(mkdtempSync(join(tmpdir(), "birbal-db-")), "agent.db");

    initDb(firstDbPath);
    upsertItem(item({ url: "https://example.com/first" }));
    assert.equal(itemExistsByUrl("https://example.com/first"), true);

    initDb(secondDbPath);
    assert.equal(itemExistsByUrl("https://example.com/first"), false);
  });

  it("closes and reopens the active database", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "birbal-db-")), "agent.db");

    initDb(dbPath);
    upsertItem(item({ url: "https://example.com/reopen" }));
    closeDb();

    initDb(dbPath);
    assert.equal(itemExistsByUrl("https://example.com/reopen"), true);
  });
});
