// Purpose: Tests db behavior.
// Scope: Covers regressions through the Node.js test runner.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import Database from "better-sqlite3";

import { CONTENT_FETCH_STATUSES } from "../src/app/constants/candidates.js";
import { SOURCE_REGISTRY } from "../src/app/constants/source-registry.js";
import { SOURCES } from "../src/app/constants/sources.js";
import {
  closeDb,
  getItemByUrl,
  getScore,
  initDb,
  listRecentItems,
  listTopScoredItems,
  listTopScoredItemsByIds,
  upsertItem,
  upsertScore,
} from "../src/app/db/items.js";
import { failRun, finishRun, getRecentRuns, startRun } from "../src/app/db/pipelineRuns.js";
import {
  createSearchSnapshot,
  getLatestSearchSnapshot,
  listSearchSnapshotItems,
  listSearchSnapshots,
  updateSearchSnapshotResultCount,
  upsertSearchSnapshotItem,
} from "../src/app/db/searchSnapshots.js";
import { createInMemoryPipelineRunStore } from "../src/framework/pipeline/runStore.js";
import type { CandidateItem, ItemScore } from "../src/app/daily/types.js";

function item(overrides: Partial<CandidateItem>): CandidateItem {
  return {
    id: "test:https://example.com/item",
    sourceId: SOURCES.ARXIV,
    sourceName: "arXiv",
    sourceType: SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC_FALLBACK,
    title: "Example Item",
    url: "https://example.com/item",
    summary: "summary",
    publishedAt: "2026-05-16T10:00:00Z",
    discoveredAt: "2026-05-16T11:00:00Z",
    contentFetchStatus: CONTENT_FETCH_STATUSES.NOT_FETCHED,
    raw: { source: "test" },
    ...overrides,
  };
}

function score(overrides: Partial<ItemScore> = {}): ItemScore {
  return {
    enterpriseRelevance: 5,
    workflowRedesignDepth: 4,
    realUseCaseSpecificity: 4,
    deploymentFdeRelevance: 3,
    businessOutcomeClarity: 4,
    technicalImplementationUsefulness: 5,
    recency: 3,
    nonGenericInsight: 4,
    rejected: false,
    reason: "Useful technical item.",
    finalScore: 7.75,
    ...overrides,
  };
}

describe("SQLite item persistence", () => {
  it("initializes the schema, upserts items, checks URLs, and lists recent items", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "birbal-db-")), "agent.db");
    initDb(dbPath);

    assert.equal(getItemByUrl("https://example.com/item"), null);

    upsertItem(item({ title: "Original" }));
    assert.ok(getItemByUrl("https://example.com/item"));

    upsertItem(item({ title: "Updated", summary: "updated summary" }));

    assert.equal(getItemByUrl("https://example.com/item")?.title, "Updated");

    const recentItems = listRecentItems(10);
    assert.deepEqual(recentItems[0], {
      id: "test:https://example.com/item",
      sourceId: SOURCES.ARXIV,
      sourceName: "arXiv",
      sourceType: SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC_FALLBACK,
      title: "Updated",
      url: "https://example.com/item",
      summary: "updated summary",
      publishedAt: "2026-05-16T10:00:00Z",
      discoveredAt: "2026-05-16T11:00:00Z",
      contentFetchStatus: CONTENT_FETCH_STATUSES.NOT_FETCHED,
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
    assert.ok(getItemByUrl("https://example.com/first"));

    initDb(secondDbPath);
    assert.equal(getItemByUrl("https://example.com/first"), null);
  });

  it("retries initialization after a migration failure", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "birbal-db-")), "agent.db");
    const incompatibleDb = new Database(dbPath);
    incompatibleDb.exec("CREATE TABLE items (id TEXT PRIMARY KEY)");
    incompatibleDb.close();

    assert.throws(() => initDb(dbPath), /published_at/);
    rmSync(dbPath);

    initDb(dbPath);
    assert.equal(getItemByUrl("https://example.com/recovered"), null);
  });

  it("migrates existing items to the enterprise candidate shape", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "birbal-db-")), "agent.db");
    const legacyDb = new Database(dbPath);
    legacyDb.exec(`
      CREATE TABLE items (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL,
        published_at TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    legacyDb
      .prepare(
        `
          INSERT INTO items (
            id,
            source,
            title,
            url,
            summary,
            published_at,
            raw_json,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        "arxiv:https://example.com/legacy",
        SOURCES.ARXIV,
        "Legacy Item",
        "https://example.com/legacy",
        "legacy summary",
        "2026-05-16T10:00:00Z",
        JSON.stringify({ legacy: true }),
        "2026-05-16T12:00:00Z",
      );
    legacyDb.close();

    initDb(dbPath);

    assert.deepEqual(getItemByUrl("https://example.com/legacy"), {
      id: "arxiv:https://example.com/legacy",
      sourceId: SOURCES.ARXIV,
      sourceName: "arXiv",
      sourceType: SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC_FALLBACK,
      title: "Legacy Item",
      url: "https://example.com/legacy",
      summary: "legacy summary",
      publishedAt: "2026-05-16T10:00:00Z",
      discoveredAt: "2026-05-16T12:00:00Z",
      contentFetchStatus: CONTENT_FETCH_STATUSES.NOT_FETCHED,
      raw: { legacy: true },
    });
  });

  it("migrates existing scores to the enterprise score shape", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "birbal-db-")), "agent.db");
    const legacyDb = new Database(dbPath);
    legacyDb.exec(`
      CREATE TABLE items (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL,
        published_at TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE scores (
        item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
        relevance REAL NOT NULL,
        technical_depth REAL NOT NULL,
        novelty REAL NOT NULL,
        practicality REAL NOT NULL,
        reason TEXT NOT NULL,
        final_score REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    legacyDb
      .prepare(
        `
          INSERT INTO items (
            id,
            source,
            title,
            url,
            summary,
            published_at,
            raw_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        "arxiv:https://example.com/scored",
        SOURCES.ARXIV,
        "Legacy Scored Item",
        "https://example.com/scored",
        "legacy summary",
        "2026-05-16T10:00:00Z",
        "{}",
      );
    legacyDb
      .prepare(
        `
          INSERT INTO scores (
            item_id,
            relevance,
            technical_depth,
            novelty,
            practicality,
            reason,
            final_score
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run("arxiv:https://example.com/scored", 8, 7, 6, 9, "legacy score", 7.75);
    legacyDb.close();

    initDb(dbPath);

    assert.deepEqual(getScore("arxiv:https://example.com/scored"), {
      enterpriseRelevance: 8,
      workflowRedesignDepth: 7,
      realUseCaseSpecificity: 8,
      deploymentFdeRelevance: 8,
      businessOutcomeClarity: 9,
      technicalImplementationUsefulness: 9,
      recency: 1,
      nonGenericInsight: 6,
      rejected: false,
      reason: "legacy score",
      finalScore: 7.75,
    });
  });

  it("closes and reopens the active database", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "birbal-db-")), "agent.db");

    initDb(dbPath);
    upsertItem(item({ url: "https://example.com/reopen" }));
    closeDb();

    initDb(dbPath);
    assert.ok(getItemByUrl("https://example.com/reopen"));
  });

  it("stores shared pipeline run metadata", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "birbal-db-")), "agent.db");
    initDb(dbPath);

    const runId = startRun("daily");
    finishRun(runId, {
      status: "partial_success",
      sourcesAttempted: 2,
      sourcesSucceeded: 1,
      sourcesFailed: 1,
      itemsCollected: 10,
      itemsStored: 3,
      itemsScored: 2,
      itemsRejected: 1,
      itemsSelected: 5,
      artifacts: [{ id: "digest", type: "markdown", path: "digests/today.md" }],
      errors: [{ message: "one source failed" }],
      metadata: { trace: true },
    });

    const recentRun = getRecentRuns("daily", 1)[0];

    assert.deepEqual(recentRun, {
      id: runId,
      pipelineId: "daily",
      runType: "manual",
      startedAt: recentRun?.startedAt,
      finishedAt: recentRun?.finishedAt,
      status: "partial_success",
      sourcesAttempted: 2,
      sourcesSucceeded: 1,
      sourcesFailed: 1,
      itemsCollected: 10,
      itemsStored: 3,
      itemsScored: 2,
      itemsRejected: 1,
      itemsSelected: 5,
      artifacts: [{ id: "digest", type: "markdown", path: "digests/today.md" }],
      errorSummary: "one source failed",
      metadata: { trace: true },
    });
  });

  it("marks shared pipeline runs as failed", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "birbal-db-")), "agent.db");
    initDb(dbPath);

    const runId = startRun("use_cases");
    failRun(runId, "model unavailable");

    const recentRuns = getRecentRuns("use_cases", 1);
    assert.equal(recentRuns[0]?.status, "failed");
    assert.equal(recentRuns[0]?.errorSummary, "model unavailable");
    assert.throws(() => getRecentRuns("use_cases", 0), /positive integer/);
  });

  it("supports an in-memory pipeline run store adapter", () => {
    const store = createInMemoryPipelineRunStore({
      now: () => new Date("2026-05-25T08:00:00.000Z"),
    });
    const runId = store.startRun("example");

    store.finishRun(runId, {
      status: "success",
      itemsCollected: 2,
      itemsSelected: 1,
      metadata: {
        mode: "test",
      },
    });

    const [run] = store.getRecentRuns("example", 1);
    assert.equal(run?.id, runId);
    assert.equal(run?.status, "success");
    assert.equal(run?.itemsCollected, 2);
    assert.equal(run?.itemsSelected, 1);
    assert.deepEqual(run?.metadata, {
      mode: "test",
    });
  });

  it("stores reusable search snapshots and lists their items", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "birbal-db-")), "agent.db");
    initDb(dbPath);

    const snapshot = createSearchSnapshot({
      pipelineId: "use_cases",
      queryCount: 2,
      metadata: { searchErrors: [] },
    });
    upsertSearchSnapshotItem({
      snapshotId: snapshot.id,
      rank: 1,
      query: "enterprise AI customer story",
      title: "Acme customer story",
      url: "https://example.com/acme?utm_source=test",
      description: "Acme deployed AI in support.",
      publishedAt: "2026-05-30",
      sourceName: "Example",
      raw: { rank: 1 },
    });
    updateSearchSnapshotResultCount(snapshot.id, 1);

    const snapshotItem = listSearchSnapshotItems(snapshot.id)[0];

    assert.equal(getLatestSearchSnapshot("use_cases")?.id, snapshot.id);
    assert.equal(listSearchSnapshots("use_cases", 10)[0]?.resultCount, 1);
    assert.deepEqual(snapshotItem, {
      snapshotId: snapshot.id,
      rank: 1,
      query: "enterprise AI customer story",
      title: "Acme customer story",
      url: "https://example.com/acme?utm_source=test",
      description: "Acme deployed AI in support.",
      publishedAt: "2026-05-30",
      sourceName: "Example",
      raw: { rank: 1 },
      createdAt: snapshotItem?.createdAt,
    });
  });
});
