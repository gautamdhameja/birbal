// Purpose: Owns pipeline lifecycle metadata, stage timing, and structured log events.
// Scope: Keeps telemetry concerns out of stage and orchestration control flow.

import type { PipelineOrchestratorDependencies } from "./contracts.js";
import type {
  PipelineConfig,
  PipelineContext,
  PipelineCounts,
  PipelineError,
  PipelineLogger,
  PipelineMetadata,
  PipelineResult,
} from "../types.js";

const PIPELINE_LOG_EVENTS = {
  STARTED: "pipeline.run.started",
  FINISHED: "pipeline.run.finished",
  STAGE_STARTED: "pipeline.stage.started",
  STAGE_FINISHED: "pipeline.stage.finished",
  STAGE_FAILED: "pipeline.stage.failed",
} as const;

const PIPELINE_LOG_MESSAGES = {
  STARTED: "pipeline run started",
  FINISHED: "pipeline run finished",
  STAGE_STARTED: "pipeline stage started",
  STAGE_FINISHED: "pipeline stage finished",
  STAGE_FAILED: "pipeline stage failed",
} as const;

export function finishMetadata(metadata: PipelineMetadata, finishedAt: Date): PipelineMetadata {
  return {
    ...metadata,
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - Date.parse(String(metadata.startedAt)),
  };
}

export function logPipelineStarted(
  logger: PipelineLogger,
  config: PipelineConfig,
  runId: string,
  startedAt: Date,
): void {
  logger.info(
    {
      event: PIPELINE_LOG_EVENTS.STARTED,
      pipelineId: config.pipelineId,
      runId,
      startedAt: startedAt.toISOString(),
    },
    PIPELINE_LOG_MESSAGES.STARTED,
  );
}

function logPipelineFinished(
  logger: PipelineLogger,
  result: PipelineResult,
  startedAt: Date,
): void {
  const finishedAt = String(result.metadata.finishedAt);
  const durationMs =
    typeof result.metadata.durationMs === "number"
      ? result.metadata.durationMs
      : Date.parse(finishedAt) - startedAt.getTime();

  logger.info(
    {
      event: PIPELINE_LOG_EVENTS.FINISHED,
      pipelineId: result.pipelineId,
      runId: result.runId,
      status: result.status,
      startedAt: startedAt.toISOString(),
      finishedAt,
      durationMs,
      counts: result.counts,
      artifactCount: result.artifacts.length,
      errorCount: result.errors.length,
    },
    PIPELINE_LOG_MESSAGES.FINISHED,
  );
}

function countOutput(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    return value.length;
  }

  return value === undefined || value === null ? undefined : 1;
}

export async function runTimedStage<TResult>(
  context: PipelineContext,
  stageId: string,
  inputCount: number | undefined,
  run: () => Promise<TResult>,
  metadata: PipelineMetadata = {},
): Promise<TResult> {
  const startedAt = new Date();
  const basePayload = {
    pipelineId: context.pipelineId,
    runId: context.runId,
    stageId,
    ...metadata,
  };

  context.logger.debug(
    {
      event: PIPELINE_LOG_EVENTS.STAGE_STARTED,
      ...basePayload,
      startedAt: startedAt.toISOString(),
      inputCount,
    },
    PIPELINE_LOG_MESSAGES.STAGE_STARTED,
  );

  try {
    const result = await run();
    const finishedAt = new Date();
    context.logger.debug(
      {
        event: PIPELINE_LOG_EVENTS.STAGE_FINISHED,
        ...basePayload,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        inputCount,
        outputCount: countOutput(result),
      },
      PIPELINE_LOG_MESSAGES.STAGE_FINISHED,
    );

    return result;
  } catch (error) {
    const finishedAt = new Date();
    context.logger.warn(
      {
        event: PIPELINE_LOG_EVENTS.STAGE_FAILED,
        ...basePayload,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        inputCount,
        error: error instanceof Error ? error.message : String(error),
      },
      PIPELINE_LOG_MESSAGES.STAGE_FAILED,
    );
    throw error;
  }
}

function finishSharedRun(
  dependencies: PipelineOrchestratorDependencies,
  runId: string,
  result: PipelineResult,
): void {
  dependencies.finishRun(runId, {
    status: result.status,
    sourcesAttempted:
      (result.counts.collectionMethodsRun ?? 0) + (result.counts.collectionErrors ?? 0),
    sourcesSucceeded: result.counts.collectionMethodsRun ?? 0,
    sourcesFailed: result.counts.collectionErrors ?? 0,
    itemsCollected: result.counts.collected ?? 0,
    itemsScored: result.counts.scored ?? 0,
    itemsRejected: result.counts.rejected ?? 0,
    itemsSelected: result.counts.selected ?? 0,
    artifacts: result.artifacts,
    errors: result.errors,
    metadata: result.metadata,
  });
}

export function finishPipelineRun(
  dependencies: PipelineOrchestratorDependencies,
  runId: string,
  result: PipelineResult,
  startedAt: Date,
): PipelineResult {
  finishSharedRun(dependencies, runId, result);
  logPipelineFinished(dependencies.logger, result, startedAt);
  return result;
}

export function failPipelineRun(
  dependencies: PipelineOrchestratorDependencies,
  config: PipelineConfig,
  runId: string,
  startedAt: Date,
  metadata: PipelineMetadata,
  counts: PipelineCounts,
  errors: PipelineError[],
  errorSummary: string,
): PipelineResult {
  const result: PipelineResult = {
    pipelineId: config.pipelineId,
    runId,
    status: "failed",
    artifacts: [],
    counts,
    errors,
    metadata: finishMetadata(metadata, dependencies.now()),
  };
  dependencies.failRun(runId, errorSummary);
  logPipelineFinished(dependencies.logger, result, startedAt);
  return result;
}
