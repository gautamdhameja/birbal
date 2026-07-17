export const RUN_SQL = {
  START_RUN: `
      INSERT INTO runs (
        id,
        pipeline_id,
        run_type,
        started_at,
        status
      )
      VALUES (
        @id,
        @pipelineId,
        @runType,
        @startedAt,
        @status
      )
    `,
  FINISH_RUN: `
      UPDATE runs
      SET
        finished_at = @finishedAt,
        status = @status,
        sources_attempted = @sourcesAttempted,
        sources_succeeded = @sourcesSucceeded,
        sources_failed = @sourcesFailed,
        items_collected = @itemsCollected,
        items_stored = @itemsStored,
        items_scored = @itemsScored,
        items_rejected = @itemsRejected,
        items_selected = @itemsSelected,
        artifacts_json = @artifactsJson,
        error_summary = @errorSummary,
        metadata_json = @metadataJson
      WHERE id = @id
    `,
  FAIL_RUN: `
      UPDATE runs
      SET
        finished_at = @finishedAt,
        status = @status,
        error_summary = @errorSummary
      WHERE id = @id
    `,
  LIST_RECENT_RUNS: `
      SELECT
        id,
        pipeline_id,
        run_type,
        started_at,
        finished_at,
        status,
        sources_attempted,
        sources_succeeded,
        sources_failed,
        items_collected,
        items_stored,
        items_scored,
        items_rejected,
        items_selected,
        artifacts_json,
        error_summary,
        metadata_json
      FROM runs
      WHERE pipeline_id = ?
      ORDER BY started_at DESC
      LIMIT ?
    `,
} as const;
