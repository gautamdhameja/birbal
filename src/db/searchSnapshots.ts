// Purpose: Persists reusable search result snapshots for model-only pipeline runs.
// Scope: Stores source acquisition outputs separately from extraction and digest runs.

import { randomUUID } from "node:crypto";

import { DATABASE } from "../constants/database.js";
import { normalizeUrl } from "../utils/url.js";
import { assertValidLimit, getDb } from "./items.js";
import { decodePersistedJson } from "./json.js";

export type SearchSnapshotInput = {
  pipelineId: string;
  queryCount: number;
  metadata?: unknown;
};

export type SearchSnapshot = {
  id: string;
  pipelineId: string;
  queryCount: number;
  resultCount: number;
  metadata: unknown;
  createdAt: string;
};

export type SearchSnapshotItemInput = {
  snapshotId: string;
  rank: number;
  query: string;
  title: string;
  url: string;
  description: string;
  publishedAt: string;
  sourceName?: string;
  raw: unknown;
};

export type SearchSnapshotItem = SearchSnapshotItemInput & {
  createdAt: string;
};

type SearchSnapshotRow = {
  id: string;
  pipeline_id: string;
  query_count: number;
  result_count: number;
  metadata_json: string;
  created_at: string;
};

type SearchSnapshotItemRow = {
  snapshot_id: string;
  rank: number;
  query: string;
  title: string;
  url: string;
  description: string;
  published_at: string;
  source_name: string | null;
  raw_json: string;
  created_at: string;
};

function snapshotFromRow(row: SearchSnapshotRow): SearchSnapshot {
  return {
    id: row.id,
    pipelineId: row.pipeline_id,
    queryCount: row.query_count,
    resultCount: row.result_count,
    metadata: decodePersistedJson(row.metadata_json, row.metadata_json),
    createdAt: row.created_at,
  };
}

function snapshotItemFromRow(row: SearchSnapshotItemRow): SearchSnapshotItem {
  return {
    snapshotId: row.snapshot_id,
    rank: row.rank,
    query: row.query,
    title: row.title,
    url: row.url,
    description: row.description,
    publishedAt: row.published_at,
    ...(row.source_name ? { sourceName: row.source_name } : {}),
    raw: decodePersistedJson(row.raw_json, row.raw_json),
    createdAt: row.created_at,
  };
}

export function createSearchSnapshot(input: SearchSnapshotInput): SearchSnapshot {
  const id = randomUUID();
  getDb()
    .prepare(DATABASE.SQL.CREATE_SEARCH_SNAPSHOT)
    .run({
      id,
      pipelineId: input.pipelineId,
      queryCount: input.queryCount,
      resultCount: 0,
      metadataJson: JSON.stringify(input.metadata ?? {}),
    });

  const snapshot = getSearchSnapshot(id);
  if (!snapshot) {
    throw new Error(`Failed to create search snapshot: ${id}`);
  }

  return snapshot;
}

export function upsertSearchSnapshotItem(item: SearchSnapshotItemInput): void {
  getDb()
    .prepare(DATABASE.SQL.UPSERT_SEARCH_SNAPSHOT_ITEM)
    .run({
      snapshotId: item.snapshotId,
      rank: item.rank,
      query: item.query,
      title: item.title,
      url: normalizeUrl(item.url),
      description: item.description,
      publishedAt: item.publishedAt,
      sourceName: item.sourceName ?? null,
      rawJson: JSON.stringify(item.raw),
    });
}

export function updateSearchSnapshotResultCount(snapshotId: string, resultCount: number): void {
  getDb().prepare(DATABASE.SQL.UPDATE_SEARCH_SNAPSHOT_RESULT_COUNT).run({
    id: snapshotId,
    resultCount,
  });
}

export function listSearchSnapshots(pipelineId: string, limit: number): SearchSnapshot[] {
  assertValidLimit(limit);

  const rows = getDb()
    .prepare(DATABASE.SQL.LIST_SEARCH_SNAPSHOTS)
    .all(pipelineId, limit) as SearchSnapshotRow[];

  return rows.map(snapshotFromRow);
}

export function getSearchSnapshot(snapshotId: string): SearchSnapshot | null {
  const row = getDb().prepare(DATABASE.SQL.GET_SEARCH_SNAPSHOT).get(snapshotId) as
    | SearchSnapshotRow
    | undefined;

  return row ? snapshotFromRow(row) : null;
}

export function getLatestSearchSnapshot(pipelineId: string): SearchSnapshot | null {
  const row = getDb().prepare(DATABASE.SQL.GET_LATEST_SEARCH_SNAPSHOT).get(pipelineId) as
    | SearchSnapshotRow
    | undefined;

  return row ? snapshotFromRow(row) : null;
}

export function listSearchSnapshotItems(snapshotId: string): SearchSnapshotItem[] {
  const rows = getDb()
    .prepare(DATABASE.SQL.LIST_SEARCH_SNAPSHOT_ITEMS)
    .all(snapshotId) as SearchSnapshotItemRow[];

  return rows.map(snapshotItemFromRow);
}
