import { randomUUID } from "node:crypto";

import { DATABASE } from "../../constants/database.js";
import { getDb } from "../../db/items.js";
import type { PipelineArtifact, PipelineError, PipelineMetadata } from "./types.js";

export type StoredRunStatus =
  | typeof DATABASE.RUN_STATUSES.SUCCESS
  | typeof DATABASE.RUN_STATUSES.PARTIAL_SUCCESS
  | typeof DATABASE.RUN_STATUSES.FAILED;

export type RunSummary = {
  status?: StoredRunStatus | "partial";
  sourcesAttempted?: number;
  sourcesSucceeded?: number;
  sourcesFailed?: number;
  itemsCollected?: number;
  itemsStored?: number;
  itemsScored?: number;
  itemsRejected?: number;
  itemsSelected?: number;
  artifacts?: PipelineArtifact[];
  errors?: PipelineError[] | Array<{ error?: string; message?: string }>;
  errorSummary?: string | null;
  metadata?: PipelineMetadata;
};

export type StoredRun = {
  id: string;
  pipelineId: string;
  runType: string;
  startedAt: string;
  finishedAt: string | null;
  status: StoredRunStatus;
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  itemsCollected: number;
  itemsStored: number;
  itemsScored: number;
  itemsRejected: number;
  itemsSelected: number;
  artifacts: unknown[];
  errorSummary: string | null;
  metadata: PipelineMetadata;
};

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

function parseJson(value: string, fallback: unknown): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeStatus(status: RunSummary["status"]): StoredRunStatus {
  if (status === "partial") {
    return DATABASE.RUN_STATUSES.PARTIAL_SUCCESS;
  }

  return status ?? DATABASE.RUN_STATUSES.SUCCESS;
}

function summarizeErrors(errors: RunSummary["errors"]): string | null {
  if (!errors || errors.length === 0) {
    return null;
  }

  return errors
    .map((error) => {
      if (error.message) {
        return error.message;
      }

      return "error" in error ? error.error : undefined;
    })
    .filter((message): message is string => Boolean(message))
    .slice(0, 5)
    .join("; ");
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
    artifacts: parseJson(row.artifacts_json, []) as unknown[],
    errorSummary: row.error_summary,
    metadata: parseJson(row.metadata_json, {}) as PipelineMetadata,
  };
}

export function startRun(pipelineId: string, runType = DATABASE.RUN_TYPES.MANUAL): string {
  const id = randomUUID();

  getDb().prepare(DATABASE.SQL.START_RUN).run({
    id,
    pipelineId,
    runType,
    startedAt: nowIso(),
    status: DATABASE.RUN_STATUSES.FAILED,
  });

  return id;
}

export function finishRun(runId: string, result: RunSummary): void {
  getDb()
    .prepare(DATABASE.SQL.FINISH_RUN)
    .run({
      id: runId,
      finishedAt: nowIso(),
      status: normalizeStatus(result.status),
      sourcesAttempted: result.sourcesAttempted ?? 0,
      sourcesSucceeded: result.sourcesSucceeded ?? 0,
      sourcesFailed: result.sourcesFailed ?? 0,
      itemsCollected: result.itemsCollected ?? 0,
      itemsStored: result.itemsStored ?? 0,
      itemsScored: result.itemsScored ?? 0,
      itemsRejected: result.itemsRejected ?? 0,
      itemsSelected: result.itemsSelected ?? 0,
      artifactsJson: JSON.stringify(result.artifacts ?? []),
      errorSummary: result.errorSummary ?? summarizeErrors(result.errors),
      metadataJson: JSON.stringify(result.metadata ?? {}),
    });
}

export function failRun(runId: string, errorSummary: string): void {
  getDb().prepare(DATABASE.SQL.FAIL_RUN).run({
    id: runId,
    finishedAt: nowIso(),
    status: DATABASE.RUN_STATUSES.FAILED,
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
