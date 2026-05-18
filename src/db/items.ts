import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";
import type { Database as DatabaseConnection } from "better-sqlite3";

import { DATABASE } from "../constants.js";
import type { CandidateItem } from "../daily/types.js";

const DEFAULT_DB_PATH = join(process.cwd(), DATABASE.DIRECTORY, DATABASE.FILE_NAME);

let db: DatabaseConnection | null = null;
let activeDbPath: string | null = null;

function getDb(): DatabaseConnection {
  return db ?? initDb();
}

export function initDb(dbPath = DEFAULT_DB_PATH): DatabaseConnection {
  if (db && activeDbPath === dbPath) {
    return db;
  }

  db?.close();
  mkdirSync(dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  activeDbPath = dbPath;
  db.pragma(DATABASE.JOURNAL_MODE);
  db.exec(DATABASE.SQL.INIT_SCHEMA);

  return db;
}

export function itemExistsByUrl(url: string): boolean {
  const row = getDb()
    .prepare(DATABASE.SQL.ITEM_EXISTS_BY_URL)
    .get(url);

  return row !== undefined;
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

function parseRawJson(rawJson: string): unknown {
  try {
    return JSON.parse(rawJson);
  } catch {
    return rawJson;
  }
}

export function listRecentItems(limit: number): CandidateItem[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(DATABASE.ERRORS.INVALID_RECENT_LIMIT);
  }

  const rows = getDb()
    .prepare(DATABASE.SQL.LIST_RECENT_ITEMS)
    .all(limit) as ItemRow[];

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    title: row.title,
    url: row.url,
    summary: row.summary,
    publishedAt: row.published_at,
    raw: parseRawJson(row.raw_json),
  }));
}
