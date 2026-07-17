// Purpose: Implements the SQLite persistence module: pipeline Runs.
// Scope: Owns storage access for one persisted data shape.

import { randomUUID } from "node:crypto";

import { DATABASE } from "../constants/database.js";
import {
  normalizeRunStatus,
  PIPELINE_RUN_STATUSES,
  PIPELINE_RUN_TYPES,
  summarizeRunErrors,
} from "../framework/pipeline/runStore.js";
import type { PipelineMetadata, StoredRun, StoredRunStatus } from "../framework/pipeline/index.js";
import type { RunSummary, PipelineRunStore } from "../framework/pipeline/runStore.js";
import { getDb } from "./items.js";
import { decodePersistedJson } from "./json.js";

type RunRow = {
  id: string;
  pipeline_id: string;
  run_type: string;
  started_at: string;
  finished_at: string | null;
  status: StoredRunStatus;
  sources_attempted: number;
  sources_succeeded: number;
  sources_failed: number;
  items_collected: number;
  items_stored: number;
  items_scored: number;
  items_rejected: number;
  items_selected: number;
  artifacts_json: string;
  error_summary: string | null;
  metadata_json: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function runFromRow(row: RunRow): StoredRun {
  return {
    id: row.id,
    pipelineId: row.pipeline_id,
    runType: row.run_type,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    sourcesAttempted: row.sources_attempted,
    sourcesSucceeded: row.sources_succeeded,
    sourcesFailed: row.sources_failed,
    itemsCollected: row.items_collected,
    itemsStored: row.items_stored,
    itemsScored: row.items_scored,
    itemsRejected: row.items_rejected,
    itemsSelected: row.items_selected,
    artifacts: decodePersistedJson(row.artifacts_json, []) as unknown[],
    errorSummary: row.error_summary,
    metadata: decodePersistedJson(row.metadata_json, {}) as PipelineMetadata,
  };
}

export function startRun(pipelineId: string, runType = PIPELINE_RUN_TYPES.MANUAL): string {
  const id = randomUUID();

  getDb().prepare(DATABASE.SQL.START_RUN).run({
    id,
    pipelineId,
    runType,
    startedAt: nowIso(),
    status: PIPELINE_RUN_STATUSES.FAILED,
  });

  return id;
}

export function finishRun(runId: string, result: RunSummary): void {
  getDb()
    .prepare(DATABASE.SQL.FINISH_RUN)
    .run({
      id: runId,
      finishedAt: nowIso(),
      status: normalizeRunStatus(result.status),
      sourcesAttempted: result.sourcesAttempted ?? 0,
      sourcesSucceeded: result.sourcesSucceeded ?? 0,
      sourcesFailed: result.sourcesFailed ?? 0,
      itemsCollected: result.itemsCollected ?? 0,
      itemsStored: result.itemsStored ?? 0,
      itemsScored: result.itemsScored ?? 0,
      itemsRejected: result.itemsRejected ?? 0,
      itemsSelected: result.itemsSelected ?? 0,
      artifactsJson: JSON.stringify(result.artifacts ?? []),
      errorSummary: result.errorSummary ?? summarizeRunErrors(result.errors),
      metadataJson: JSON.stringify(result.metadata ?? {}),
    });
}

export function failRun(runId: string, errorSummary: string): void {
  getDb().prepare(DATABASE.SQL.FAIL_RUN).run({
    id: runId,
    finishedAt: nowIso(),
    status: PIPELINE_RUN_STATUSES.FAILED,
    errorSummary,
  });
}

export function getRecentRuns(pipelineId: string, limit: number): StoredRun[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(DATABASE.ERRORS.INVALID_LIMIT);
  }

  const rows = getDb().prepare(DATABASE.SQL.LIST_RECENT_RUNS).all(pipelineId, limit) as RunRow[];

  return rows.map(runFromRow);
}

export const sqlitePipelineRunStore: PipelineRunStore = {
  startRun,
  finishRun,
  failRun,
  getRecentRuns,
};
