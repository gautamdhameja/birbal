import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { SOURCES } from "../src/constants.js";
import { initDb, itemExistsByUrl, listRecentItems, upsertItem } from "../src/db/items.js";
import type { CandidateItem } from "../src/daily/types.js";

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

describe("SQLite item persistence", () => {
  it("initializes the schema, upserts items, checks URLs, and lists recent items", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "birbal-db-")), "agent.db");
    initDb(dbPath);

    assert.equal(itemExistsByUrl("https://example.com/item"), false);

    upsertItem(item({ title: "Original" }));
    assert.equal(itemExistsByUrl("https://example.com/item"), true);

    upsertItem(item({ title: "Updated", summary: "updated summary" }));

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

  it("reinitializes when a different database path is requested", () => {
    const firstDbPath = join(mkdtempSync(join(tmpdir(), "birbal-db-")), "agent.db");
    const secondDbPath = join(mkdtempSync(join(tmpdir(), "birbal-db-")), "agent.db");

    initDb(firstDbPath);
    upsertItem(item({ url: "https://example.com/first" }));
    assert.equal(itemExistsByUrl("https://example.com/first"), true);

    initDb(secondDbPath);
    assert.equal(itemExistsByUrl("https://example.com/first"), false);
  });
});
