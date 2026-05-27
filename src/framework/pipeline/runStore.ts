import { randomUUID } from "node:crypto";

import type { PipelineArtifact, PipelineError, PipelineMetadata } from "./types.js";

export const PIPELINE_RUN_STATUSES = {
  SUCCESS: "success",
  PARTIAL_SUCCESS: "partial_success",
  FAILED: "failed",
} as const;

export const PIPELINE_RUN_TYPES = {
  MANUAL: "manual",
} as const;

export type StoredRunStatus = (typeof PIPELINE_RUN_STATUSES)[keyof typeof PIPELINE_RUN_STATUSES];

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

export type PipelineRunStore = {
  startRun(pipelineId: string, runType?: string): string;
  finishRun(runId: string, result: RunSummary): void;
  failRun(runId: string, errorSummary: string): void;
  getRecentRuns(pipelineId: string, limit: number): StoredRun[];
};

export type InMemoryPipelineRunStoreOptions = {
  now?: () => Date;
};

export function normalizeRunStatus(status: RunSummary["status"]): StoredRunStatus {
  if (status === "partial") {
    return PIPELINE_RUN_STATUSES.PARTIAL_SUCCESS;
  }

  return status ?? PIPELINE_RUN_STATUSES.SUCCESS;
}

export function summarizeRunErrors(errors: RunSummary["errors"]): string | null {
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

export function createInMemoryPipelineRunStore(
  options: InMemoryPipelineRunStoreOptions = {},
): PipelineRunStore {
  const now = options.now ?? (() => new Date());
  const runs = new Map<string, StoredRun>();

  return {
    startRun(pipelineId, runType = PIPELINE_RUN_TYPES.MANUAL) {
      const id = randomUUID();
      runs.set(id, {
        id,
        pipelineId,
        runType,
        startedAt: now().toISOString(),
        finishedAt: null,
        status: PIPELINE_RUN_STATUSES.FAILED,
        sourcesAttempted: 0,
        sourcesSucceeded: 0,
        sourcesFailed: 0,
        itemsCollected: 0,
        itemsStored: 0,
        itemsScored: 0,
        itemsRejected: 0,
        itemsSelected: 0,
        artifacts: [],
        errorSummary: null,
        metadata: {},
      });

      return id;
    },
    finishRun(runId, result) {
      const existingRun = runs.get(runId);
      if (!existingRun) {
        return;
      }

      runs.set(runId, {
        ...existingRun,
        finishedAt: now().toISOString(),
        status: normalizeRunStatus(result.status),
        sourcesAttempted: result.sourcesAttempted ?? 0,
        sourcesSucceeded: result.sourcesSucceeded ?? 0,
        sourcesFailed: result.sourcesFailed ?? 0,
        itemsCollected: result.itemsCollected ?? 0,
        itemsStored: result.itemsStored ?? 0,
        itemsScored: result.itemsScored ?? 0,
        itemsRejected: result.itemsRejected ?? 0,
        itemsSelected: result.itemsSelected ?? 0,
        artifacts: result.artifacts ?? [],
        errorSummary: result.errorSummary ?? summarizeRunErrors(result.errors),
        metadata: result.metadata ?? {},
      });
    },
    failRun(runId, errorSummary) {
      const existingRun = runs.get(runId);
      if (!existingRun) {
        return;
      }

      runs.set(runId, {
        ...existingRun,
        finishedAt: now().toISOString(),
        status: PIPELINE_RUN_STATUSES.FAILED,
        errorSummary,
      });
    },
    getRecentRuns(pipelineId, limit) {
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("Limit must be a positive integer.");
      }

      return [...runs.values()]
        .filter((run) => run.pipelineId === pipelineId)
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
        .slice(0, limit);
    },
  };
}
