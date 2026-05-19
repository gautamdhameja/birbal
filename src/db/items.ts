import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";
import type { Database as DatabaseConnection } from "better-sqlite3";

import { DATABASE } from "../constants/database.js";
import type { CandidateItem, ItemScore, ScoredCandidateItem } from "../daily/types.js";

let db: DatabaseConnection | null = null;
let activeDbPath: string | null = null;

function getDefaultDbPath(): string {
  return join(process.cwd(), DATABASE.DIRECTORY, DATABASE.FILE_NAME);
}

function getDb(): DatabaseConnection {
  return db ?? initDb();
}

export function closeDb(): void {
  db?.close();
  db = null;
  activeDbPath = null;
}

export function initDb(dbPath = getDefaultDbPath()): DatabaseConnection {
  if (db && activeDbPath === dbPath) {
    return db;
  }

  closeDb();
  mkdirSync(dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  activeDbPath = dbPath;
  db.pragma(DATABASE.FOREIGN_KEYS);
  db.pragma(DATABASE.JOURNAL_MODE);
  db.exec(DATABASE.SQL.INIT_SCHEMA);

  return db;
}

export function itemExistsByUrl(url: string): boolean {
  const row = getDb().prepare(DATABASE.SQL.ITEM_EXISTS_BY_URL).get(url);

  return row !== undefined;
}

export function getItemByUrl(url: string): CandidateItem | null {
  const row = getDb().prepare(DATABASE.SQL.GET_ITEM_BY_URL).get(url) as ItemRow | undefined;

  return row ? itemFromRow(row) : null;
}

export function upsertItem(candidate: CandidateItem): void {
  getDb()
    .prepare(DATABASE.SQL.UPSERT_ITEM)
    .run({
      id: candidate.id,
      source: candidate.source,
      title: candidate.title,
      url: candidate.url,
      summary: candidate.summary,
      publishedAt: candidate.publishedAt,
      rawJson: JSON.stringify(candidate.raw),
    });
}

type ItemRow = {
  id: string;
  source: CandidateItem["source"];
  title: string;
  url: string;
  summary: string;
  published_at: string;
  raw_json: string;
};

type ScoreRow = {
  relevance: number;
  technical_depth: number;
  novelty: number;
  practicality: number;
  reason: string;
  final_score: number;
};

type ScoredItemRow = ItemRow & ScoreRow;

function parseRawJson(rawJson: string): unknown {
  try {
    return JSON.parse(rawJson);
  } catch {
    return rawJson;
  }
}

function itemFromRow(row: ItemRow): CandidateItem {
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    url: row.url,
    summary: row.summary,
    publishedAt: row.published_at,
    raw: parseRawJson(row.raw_json),
  };
}

function scoreFromRow(row: ScoreRow): ItemScore {
  return {
    relevance: row.relevance,
    technical_depth: row.technical_depth,
    novelty: row.novelty,
    practicality: row.practicality,
    reason: row.reason,
    finalScore: row.final_score,
  };
}

function assertValidLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(DATABASE.ERRORS.INVALID_LIMIT);
  }
}

export function listRecentItems(limit: number): CandidateItem[] {
  assertValidLimit(limit);

  const rows = getDb().prepare(DATABASE.SQL.LIST_RECENT_ITEMS).all(limit) as ItemRow[];

  return rows.map(itemFromRow);
}

export function upsertScore(itemId: string, score: ItemScore): void {
  getDb().prepare(DATABASE.SQL.UPSERT_SCORE).run({
    itemId,
    relevance: score.relevance,
    technicalDepth: score.technical_depth,
    novelty: score.novelty,
    practicality: score.practicality,
    reason: score.reason,
    finalScore: score.finalScore,
  });
}

export function getScore(itemId: string): ItemScore | null {
  const row = getDb().prepare(DATABASE.SQL.GET_SCORE_BY_ITEM_ID).get(itemId) as
    | ScoreRow
    | undefined;

  return row ? scoreFromRow(row) : null;
}

export function listTopScoredItems(limit: number): ScoredCandidateItem[] {
  assertValidLimit(limit);

  const rows = getDb().prepare(DATABASE.SQL.LIST_TOP_SCORED_ITEMS).all(limit) as ScoredItemRow[];

  return rows.map((row) => ({
    ...itemFromRow(row),
    score: scoreFromRow(row),
  }));
}

export function listTopScoredItemsByIds(
  itemIds: readonly string[],
  limit: number,
): ScoredCandidateItem[] {
  assertValidLimit(limit);
  if (itemIds.length === 0) {
    return [];
  }

  const placeholders = itemIds.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `${DATABASE.SQL.LIST_TOP_SCORED_ITEMS_BY_IDS} (${placeholders})
      ${DATABASE.SQL.LIST_TOP_SCORED_ITEMS_ORDER_LIMIT}`,
    )
    .all(...itemIds, limit) as ScoredItemRow[];

  return rows.map((row) => ({
    ...itemFromRow(row),
    score: scoreFromRow(row),
  }));
}
