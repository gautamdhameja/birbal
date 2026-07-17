// Purpose: Implements the SQLite persistence module: items.
// Scope: Owns storage access for one persisted data shape.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";
import type { Database as DatabaseConnection } from "better-sqlite3";

import { CONTENT_FETCH_STATUSES } from "../constants/candidates.js";
import { DATABASE } from "../constants/database.js";
import { SOURCE_REGISTRY } from "../constants/source-registry.js";
import { SOURCES } from "../constants/sources.js";
import type {
  CandidateCategory,
  CandidateItem,
  CandidateSourceType,
  ContentFetchStatus,
  ItemScore,
  ScoredCandidateItem,
} from "../daily/types.js";
import { decodePersistedJson } from "./json.js";
import { ITEM_SQL } from "./sql/items.js";
import { SCHEMA_SQL } from "./sql/schema.js";

let db: DatabaseConnection | null = null;
let activeDbPath: string | null = null;

function getDefaultDbPath(): string {
  return join(process.cwd(), DATABASE.DIRECTORY, DATABASE.FILE_NAME);
}

export function getDb(): DatabaseConnection {
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

  const connection = new Database(dbPath);
  try {
    connection.pragma(DATABASE.FOREIGN_KEYS);
    connection.pragma(DATABASE.JOURNAL_MODE);
    connection.transaction(() => {
      connection.exec(SCHEMA_SQL.INIT_SCHEMA);
      migrateItemsTable(connection);
      migrateScoresTable(connection);
    })();

    db = connection;
    activeDbPath = dbPath;
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}

type TableInfoRow = {
  name: string;
};

function listTableColumns(connection: DatabaseConnection, tableName: string): Set<string> {
  const rows = connection.prepare(`PRAGMA table_info(${tableName})`).all() as TableInfoRow[];
  return new Set(rows.map((row) => row.name));
}

function addColumnIfMissing(
  connection: DatabaseConnection,
  tableName: string,
  columns: Set<string>,
  columnName: string,
  definition: string,
): void {
  if (columns.has(columnName)) {
    return;
  }

  connection.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  columns.add(columnName);
}

function migrateItemsTable(connection: DatabaseConnection): void {
  const columns = listTableColumns(connection, "items");
  const hadSourceType = columns.has(DATABASE.ITEM_COLUMNS.SOURCE_TYPE);

  addColumnIfMissing(
    connection,
    "items",
    columns,
    DATABASE.ITEM_COLUMNS.SOURCE_ID,
    "TEXT NOT NULL DEFAULT ''",
  );
  addColumnIfMissing(
    connection,
    "items",
    columns,
    DATABASE.ITEM_COLUMNS.SOURCE_NAME,
    "TEXT NOT NULL DEFAULT ''",
  );
  addColumnIfMissing(
    connection,
    "items",
    columns,
    DATABASE.ITEM_COLUMNS.SOURCE_TYPE,
    `TEXT NOT NULL DEFAULT '${SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY}'`,
  );
  addColumnIfMissing(
    connection,
    "items",
    columns,
    DATABASE.ITEM_COLUMNS.DISCOVERED_AT,
    "TEXT NOT NULL DEFAULT ''",
  );
  addColumnIfMissing(connection, "items", columns, DATABASE.ITEM_COLUMNS.CONTENT_TEXT, "TEXT");
  addColumnIfMissing(
    connection,
    "items",
    columns,
    DATABASE.ITEM_COLUMNS.CONTENT_FETCH_STATUS,
    `TEXT NOT NULL DEFAULT '${CONTENT_FETCH_STATUSES.NOT_FETCHED}'`,
  );
  addColumnIfMissing(connection, "items", columns, DATABASE.ITEM_COLUMNS.CATEGORY, "TEXT");

  connection
    .prepare(
      `
        UPDATE items
        SET
          source_id = CASE
            WHEN source_id = '' THEN source
            ELSE source_id
          END,
          source_name = CASE
            WHEN source_name != '' THEN source_name
            WHEN source = @arxiv THEN 'arXiv'
            WHEN source = @hackerNews THEN 'Hacker News'
            ELSE source
          END,
          source_type = CASE
            WHEN @hadSourceType = 0 AND source = @arxiv THEN @academicFallback
            WHEN @hadSourceType = 0 THEN @community
            WHEN source_type != '' AND source_type IS NOT NULL THEN source_type
            WHEN source = @arxiv THEN @academicFallback
            ELSE @community
          END,
          discovered_at = CASE
            WHEN discovered_at != '' THEN discovered_at
            ELSE created_at
          END,
          content_fetch_status = CASE
            WHEN content_fetch_status != '' THEN content_fetch_status
            ELSE @notFetched
          END
        WHERE source_id = ''
          OR source_name = ''
          OR source_type = ''
          OR discovered_at = ''
          OR content_fetch_status = ''
      `,
    )
    .run({
      arxiv: SOURCES.ARXIV,
      hackerNews: SOURCES.HACKER_NEWS,
      academicFallback: SOURCE_REGISTRY.SOURCE_TYPES.ACADEMIC_FALLBACK,
      community: SOURCE_REGISTRY.SOURCE_TYPES.COMMUNITY,
      hadSourceType: hadSourceType ? 1 : 0,
      notFetched: CONTENT_FETCH_STATUSES.NOT_FETCHED,
    });

  connection.exec(`
    CREATE INDEX IF NOT EXISTS idx_items_source_id ON items (source_id);
    CREATE INDEX IF NOT EXISTS idx_items_discovered_at ON items (discovered_at DESC);
  `);
}

function migrateScoresTable(connection: DatabaseConnection): void {
  const columns = listTableColumns(connection, "scores");

  addColumnIfMissing(
    connection,
    "scores",
    columns,
    DATABASE.SCORE_COLUMNS.ENTERPRISE_RELEVANCE,
    "REAL NOT NULL DEFAULT 1",
  );
  addColumnIfMissing(
    connection,
    "scores",
    columns,
    DATABASE.SCORE_COLUMNS.WORKFLOW_REDESIGN_DEPTH,
    "REAL NOT NULL DEFAULT 1",
  );
  addColumnIfMissing(
    connection,
    "scores",
    columns,
    DATABASE.SCORE_COLUMNS.REAL_USE_CASE_SPECIFICITY,
    "REAL NOT NULL DEFAULT 1",
  );
  addColumnIfMissing(
    connection,
    "scores",
    columns,
    DATABASE.SCORE_COLUMNS.DEPLOYMENT_FDE_RELEVANCE,
    "REAL NOT NULL DEFAULT 1",
  );
  addColumnIfMissing(
    connection,
    "scores",
    columns,
    DATABASE.SCORE_COLUMNS.BUSINESS_OUTCOME_CLARITY,
    "REAL NOT NULL DEFAULT 1",
  );
  addColumnIfMissing(
    connection,
    "scores",
    columns,
    DATABASE.SCORE_COLUMNS.TECHNICAL_IMPLEMENTATION_USEFULNESS,
    "REAL NOT NULL DEFAULT 1",
  );
  addColumnIfMissing(
    connection,
    "scores",
    columns,
    DATABASE.SCORE_COLUMNS.RECENCY,
    "REAL NOT NULL DEFAULT 1",
  );
  addColumnIfMissing(
    connection,
    "scores",
    columns,
    DATABASE.SCORE_COLUMNS.NON_GENERIC_INSIGHT,
    "REAL NOT NULL DEFAULT 1",
  );
  addColumnIfMissing(
    connection,
    "scores",
    columns,
    DATABASE.SCORE_COLUMNS.REJECTED,
    "INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    connection,
    "scores",
    columns,
    DATABASE.SCORE_COLUMNS.REJECTION_REASON,
    "TEXT",
  );

  connection
    .prepare(
      `
        UPDATE scores
        SET
          enterprise_relevance = relevance,
          workflow_redesign_depth = technical_depth,
          real_use_case_specificity = relevance,
          deployment_fde_relevance = relevance,
          business_outcome_clarity = practicality,
          technical_implementation_usefulness = practicality,
          recency = 1,
          non_generic_insight = novelty
        WHERE enterprise_relevance = 1
          AND workflow_redesign_depth = 1
          AND real_use_case_specificity = 1
          AND deployment_fde_relevance = 1
          AND business_outcome_clarity = 1
          AND technical_implementation_usefulness = 1
          AND recency = 1
          AND non_generic_insight = 1
          AND (relevance != 1 OR technical_depth != 1 OR novelty != 1 OR practicality != 1)
      `,
    )
    .run();
}

export function itemExistsByUrl(url: string): boolean {
  const row = getDb().prepare(ITEM_SQL.ITEM_EXISTS_BY_URL).get(url);

  return row !== undefined;
}

export function getItemByUrl(url: string): CandidateItem | null {
  const row = getDb().prepare(ITEM_SQL.GET_ITEM_BY_URL).get(url) as ItemRow | undefined;

  return row ? itemFromRow(row) : null;
}

export function upsertItem(candidate: CandidateItem): void {
  getDb()
    .prepare(ITEM_SQL.UPSERT_ITEM)
    .run({
      id: candidate.id,
      sourceId: candidate.sourceId,
      sourceName: candidate.sourceName,
      sourceType: candidate.sourceType,
      title: candidate.title,
      url: candidate.url,
      summary: candidate.summary,
      publishedAt: candidate.publishedAt,
      discoveredAt: candidate.discoveredAt,
      contentText: candidate.contentText ?? null,
      contentFetchStatus: candidate.contentFetchStatus,
      category: candidate.category ?? null,
      rawJson: JSON.stringify(candidate.raw),
    });
}

type ItemRow = {
  id: string;
  source_id: string;
  source_name: string;
  source_type: CandidateSourceType;
  title: string;
  url: string;
  summary: string;
  published_at: string;
  discovered_at: string;
  content_text: string | null;
  content_fetch_status: ContentFetchStatus;
  category: CandidateCategory | null;
  raw_json: string;
};

type ScoreRow = {
  enterprise_relevance: number;
  workflow_redesign_depth: number;
  real_use_case_specificity: number;
  deployment_fde_relevance: number;
  business_outcome_clarity: number;
  technical_implementation_usefulness: number;
  recency: number;
  non_generic_insight: number;
  rejected: number;
  rejection_reason: string | null;
  reason: string;
  final_score: number;
};

type ScoredItemRow = ItemRow & ScoreRow;

function itemFromRow(row: ItemRow): CandidateItem {
  const item: CandidateItem = {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceType: row.source_type,
    title: row.title,
    url: row.url,
    summary: row.summary,
    publishedAt: row.published_at,
    discoveredAt: row.discovered_at,
    contentFetchStatus: row.content_fetch_status,
    raw: decodePersistedJson(row.raw_json, row.raw_json),
  };

  if (row.content_text !== null) {
    item.contentText = row.content_text;
  }
  if (row.category !== null) {
    item.category = row.category;
  }

  return item;
}

function scoreFromRow(row: ScoreRow): ItemScore {
  const score: ItemScore = {
    enterpriseRelevance: row.enterprise_relevance,
    workflowRedesignDepth: row.workflow_redesign_depth,
    realUseCaseSpecificity: row.real_use_case_specificity,
    deploymentFdeRelevance: row.deployment_fde_relevance,
    businessOutcomeClarity: row.business_outcome_clarity,
    technicalImplementationUsefulness: row.technical_implementation_usefulness,
    recency: row.recency,
    nonGenericInsight: row.non_generic_insight,
    rejected: Boolean(row.rejected),
    reason: row.reason,
    finalScore: row.final_score,
  };

  if (row.rejection_reason !== null) {
    score.rejectionReason = row.rejection_reason;
  }

  return score;
}

export function assertValidLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(DATABASE.ERRORS.INVALID_LIMIT);
  }
}

export function listRecentItems(limit: number): CandidateItem[] {
  assertValidLimit(limit);

  const rows = getDb().prepare(ITEM_SQL.LIST_RECENT_ITEMS).all(limit) as ItemRow[];

  return rows.map(itemFromRow);
}

export function upsertScore(itemId: string, score: ItemScore): void {
  getDb()
    .prepare(ITEM_SQL.UPSERT_SCORE)
    .run({
      itemId,
      relevance: score.enterpriseRelevance,
      technicalDepth: score.workflowRedesignDepth,
      novelty: score.nonGenericInsight,
      practicality: score.technicalImplementationUsefulness,
      enterpriseRelevance: score.enterpriseRelevance,
      workflowRedesignDepth: score.workflowRedesignDepth,
      realUseCaseSpecificity: score.realUseCaseSpecificity,
      deploymentFdeRelevance: score.deploymentFdeRelevance,
      businessOutcomeClarity: score.businessOutcomeClarity,
      technicalImplementationUsefulness: score.technicalImplementationUsefulness,
      recency: score.recency,
      nonGenericInsight: score.nonGenericInsight,
      rejected: score.rejected ? 1 : 0,
      rejectionReason: score.rejectionReason ?? null,
      reason: score.reason,
      finalScore: score.finalScore,
    });
}

export function getScore(itemId: string): ItemScore | null {
  const row = getDb().prepare(ITEM_SQL.GET_SCORE_BY_ITEM_ID).get(itemId) as ScoreRow | undefined;

  return row ? scoreFromRow(row) : null;
}

export function listTopScoredItems(limit: number): ScoredCandidateItem[] {
  assertValidLimit(limit);

  const rows = getDb().prepare(ITEM_SQL.LIST_TOP_SCORED_ITEMS).all(limit) as ScoredItemRow[];

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
      `${ITEM_SQL.LIST_TOP_SCORED_ITEMS_BY_IDS} (${placeholders})
      ${ITEM_SQL.LIST_TOP_SCORED_ITEMS_ORDER_LIMIT}`,
    )
    .all(...itemIds, limit) as ScoredItemRow[];

  return rows.map((row) => ({
    ...itemFromRow(row),
    score: scoreFromRow(row),
  }));
}
