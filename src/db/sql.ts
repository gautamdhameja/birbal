// Purpose: Defines SQLite statements used by the persistence layer.
// Scope: Keeps schema and query text near database modules instead of generic constants.

export const DATABASE_SQL = {
  INIT_SCHEMA: `
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_name TEXT NOT NULL,
        source_type TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL,
        published_at TEXT NOT NULL,
        discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        content_text TEXT,
        content_fetch_status TEXT NOT NULL DEFAULT 'not_fetched',
        category TEXT,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_items_published_at ON items (published_at DESC);

      CREATE TABLE IF NOT EXISTS scores (
        item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
        relevance REAL NOT NULL,
        technical_depth REAL NOT NULL,
        novelty REAL NOT NULL,
        practicality REAL NOT NULL,
        enterprise_relevance REAL NOT NULL DEFAULT 1,
        workflow_redesign_depth REAL NOT NULL DEFAULT 1,
        real_use_case_specificity REAL NOT NULL DEFAULT 1,
        deployment_fde_relevance REAL NOT NULL DEFAULT 1,
        business_outcome_clarity REAL NOT NULL DEFAULT 1,
        technical_implementation_usefulness REAL NOT NULL DEFAULT 1,
        recency REAL NOT NULL DEFAULT 1,
        non_generic_insight REAL NOT NULL DEFAULT 1,
        rejected INTEGER NOT NULL DEFAULT 0,
        rejection_reason TEXT,
        reason TEXT NOT NULL,
        final_score REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_scores_final_score ON scores (final_score DESC);

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        pipeline_id TEXT NOT NULL,
        run_type TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        sources_attempted INTEGER NOT NULL DEFAULT 0,
        sources_succeeded INTEGER NOT NULL DEFAULT 0,
        sources_failed INTEGER NOT NULL DEFAULT 0,
        items_collected INTEGER NOT NULL DEFAULT 0,
        items_stored INTEGER NOT NULL DEFAULT 0,
        items_scored INTEGER NOT NULL DEFAULT 0,
        items_rejected INTEGER NOT NULL DEFAULT 0,
        items_selected INTEGER NOT NULL DEFAULT 0,
        artifacts_json TEXT NOT NULL DEFAULT '[]',
        error_summary TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_runs_pipeline_started_at
        ON runs (pipeline_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS use_cases (
        id TEXT PRIMARY KEY,
        run_id TEXT,
        company_name TEXT NOT NULL,
        industry TEXT NOT NULL,
        business_function TEXT NOT NULL,
        workflow_affected TEXT NOT NULL,
        workflow_before TEXT NOT NULL,
        workflow_after TEXT NOT NULL,
        ai_system_or_capability TEXT NOT NULL,
        human_role_change TEXT NOT NULL,
        system_integrations TEXT NOT NULL,
        deployment_stage TEXT NOT NULL,
        roi_metric TEXT NOT NULL,
        business_outcome TEXT NOT NULL,
        governance_or_risk_notes TEXT NOT NULL,
        implementation_details TEXT NOT NULL,
        source_title TEXT NOT NULL,
        source_url TEXT NOT NULL,
        source_name TEXT NOT NULL,
        publish_date TEXT NOT NULL,
        evidence_summary TEXT NOT NULL,
        confidence_score REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        raw_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_url, company_name, workflow_affected)
      );

      CREATE INDEX IF NOT EXISTS idx_use_cases_created_at
        ON use_cases (created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_use_cases_run_id
        ON use_cases (run_id, created_at DESC);
    `,
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
  ITEM_EXISTS_BY_URL: "SELECT 1 FROM items WHERE url = ? LIMIT 1",
  GET_ITEM_BY_URL: `
      SELECT
        id,
        source_id,
        source_name,
        source_type,
        title,
        url,
        summary,
        published_at,
        discovered_at,
        content_text,
        content_fetch_status,
        category,
        raw_json
      FROM items
      WHERE url = ?
      LIMIT 1
    `,
  UPSERT_ITEM: `
      INSERT INTO items (
        id,
        source,
        source_id,
        source_name,
        source_type,
        title,
        url,
        summary,
        published_at,
        discovered_at,
        content_text,
        content_fetch_status,
        category,
        raw_json
      )
      VALUES (
        @id,
        @sourceId,
        @sourceId,
        @sourceName,
        @sourceType,
        @title,
        @url,
        @summary,
        @publishedAt,
        @discoveredAt,
        @contentText,
        @contentFetchStatus,
        @category,
        @rawJson
      )
      ON CONFLICT(url) DO UPDATE SET
        source = excluded.source,
        source_id = excluded.source_id,
        source_name = excluded.source_name,
        source_type = excluded.source_type,
        title = excluded.title,
        summary = excluded.summary,
        published_at = excluded.published_at,
        discovered_at = excluded.discovered_at,
        content_text = excluded.content_text,
        content_fetch_status = excluded.content_fetch_status,
        category = excluded.category,
        raw_json = excluded.raw_json,
        updated_at = CURRENT_TIMESTAMP
    `,
  LIST_RECENT_ITEMS: `
      SELECT
        id,
        source_id,
        source_name,
        source_type,
        title,
        url,
        summary,
        published_at,
        discovered_at,
        content_text,
        content_fetch_status,
        category,
        raw_json
      FROM items
      ORDER BY published_at DESC, title ASC
      LIMIT ?
    `,
  UPSERT_SCORE: `
      INSERT INTO scores (
        item_id,
        relevance,
        technical_depth,
        novelty,
        practicality,
        enterprise_relevance,
        workflow_redesign_depth,
        real_use_case_specificity,
        deployment_fde_relevance,
        business_outcome_clarity,
        technical_implementation_usefulness,
        recency,
        non_generic_insight,
        rejected,
        rejection_reason,
        reason,
        final_score
      )
      VALUES (
        @itemId,
        @relevance,
        @technicalDepth,
        @novelty,
        @practicality,
        @enterpriseRelevance,
        @workflowRedesignDepth,
        @realUseCaseSpecificity,
        @deploymentFdeRelevance,
        @businessOutcomeClarity,
        @technicalImplementationUsefulness,
        @recency,
        @nonGenericInsight,
        @rejected,
        @rejectionReason,
        @reason,
        @finalScore
      )
      ON CONFLICT(item_id) DO UPDATE SET
        relevance = excluded.relevance,
        technical_depth = excluded.technical_depth,
        novelty = excluded.novelty,
        practicality = excluded.practicality,
        enterprise_relevance = excluded.enterprise_relevance,
        workflow_redesign_depth = excluded.workflow_redesign_depth,
        real_use_case_specificity = excluded.real_use_case_specificity,
        deployment_fde_relevance = excluded.deployment_fde_relevance,
        business_outcome_clarity = excluded.business_outcome_clarity,
        technical_implementation_usefulness = excluded.technical_implementation_usefulness,
        recency = excluded.recency,
        non_generic_insight = excluded.non_generic_insight,
        rejected = excluded.rejected,
        rejection_reason = excluded.rejection_reason,
        reason = excluded.reason,
        final_score = excluded.final_score,
        updated_at = CURRENT_TIMESTAMP
    `,
  GET_SCORE_BY_ITEM_ID: `
      SELECT
        enterprise_relevance,
        workflow_redesign_depth,
        real_use_case_specificity,
        deployment_fde_relevance,
        business_outcome_clarity,
        technical_implementation_usefulness,
        recency,
        non_generic_insight,
        rejected,
        rejection_reason,
        reason,
        final_score
      FROM scores
      WHERE item_id = ?
      LIMIT 1
    `,
  LIST_TOP_SCORED_ITEMS: `
      SELECT
        items.id,
        items.source_id,
        items.source_name,
        items.source_type,
        items.title,
        items.url,
        items.summary,
        items.published_at,
        items.discovered_at,
        items.content_text,
        items.content_fetch_status,
        items.category,
        items.raw_json,
        scores.relevance,
        scores.technical_depth,
        scores.novelty,
        scores.practicality,
        scores.enterprise_relevance,
        scores.workflow_redesign_depth,
        scores.real_use_case_specificity,
        scores.deployment_fde_relevance,
        scores.business_outcome_clarity,
        scores.technical_implementation_usefulness,
        scores.recency,
        scores.non_generic_insight,
        scores.rejected,
        scores.rejection_reason,
        scores.reason,
        scores.final_score
      FROM scores
      INNER JOIN items ON items.id = scores.item_id
      ORDER BY scores.final_score DESC, items.title ASC
      LIMIT ?
    `,
  LIST_TOP_SCORED_ITEMS_BY_IDS: `
      SELECT
        items.id,
        items.source_id,
        items.source_name,
        items.source_type,
        items.title,
        items.url,
        items.summary,
        items.published_at,
        items.discovered_at,
        items.content_text,
        items.content_fetch_status,
        items.category,
        items.raw_json,
        scores.relevance,
        scores.technical_depth,
        scores.novelty,
        scores.practicality,
        scores.enterprise_relevance,
        scores.workflow_redesign_depth,
        scores.real_use_case_specificity,
        scores.deployment_fde_relevance,
        scores.business_outcome_clarity,
        scores.technical_implementation_usefulness,
        scores.recency,
        scores.non_generic_insight,
        scores.rejected,
        scores.rejection_reason,
        scores.reason,
        scores.final_score
      FROM scores
      INNER JOIN items ON items.id = scores.item_id
      WHERE items.id IN
    `,
  LIST_TOP_SCORED_ITEMS_ORDER_LIMIT: `
      ORDER BY scores.final_score DESC, items.title ASC
      LIMIT ?
    `,
  UPSERT_USE_CASE: `
      INSERT INTO use_cases (
        id,
        run_id,
        company_name,
        industry,
        business_function,
        workflow_affected,
        workflow_before,
        workflow_after,
        ai_system_or_capability,
        human_role_change,
        system_integrations,
        deployment_stage,
        roi_metric,
        business_outcome,
        governance_or_risk_notes,
        implementation_details,
        source_title,
        source_url,
        source_name,
        publish_date,
        evidence_summary,
        confidence_score,
        raw_json
      )
      VALUES (
        @id,
        @runId,
        @companyName,
        @industry,
        @businessFunction,
        @workflowAffected,
        @workflowBefore,
        @workflowAfter,
        @aiSystemOrCapability,
        @humanRoleChange,
        @systemIntegrations,
        @deploymentStage,
        @roiMetric,
        @businessOutcome,
        @governanceOrRiskNotes,
        @implementationDetails,
        @sourceTitle,
        @sourceUrl,
        @sourceName,
        @publishDate,
        @evidenceSummary,
        @confidenceScore,
        @rawJson
      )
      ON CONFLICT(source_url, company_name, workflow_affected) DO UPDATE SET
        id = excluded.id,
        run_id = excluded.run_id,
        industry = excluded.industry,
        business_function = excluded.business_function,
        workflow_before = excluded.workflow_before,
        workflow_after = excluded.workflow_after,
        ai_system_or_capability = excluded.ai_system_or_capability,
        human_role_change = excluded.human_role_change,
        system_integrations = excluded.system_integrations,
        deployment_stage = excluded.deployment_stage,
        roi_metric = excluded.roi_metric,
        business_outcome = excluded.business_outcome,
        governance_or_risk_notes = excluded.governance_or_risk_notes,
        implementation_details = excluded.implementation_details,
        source_title = excluded.source_title,
        source_name = excluded.source_name,
        publish_date = excluded.publish_date,
        evidence_summary = excluded.evidence_summary,
        confidence_score = excluded.confidence_score,
        raw_json = excluded.raw_json,
        updated_at = CURRENT_TIMESTAMP
    `,
  LIST_RECENT_USE_CASES: `
      SELECT
        id,
        run_id,
        company_name,
        industry,
        business_function,
        workflow_affected,
        workflow_before,
        workflow_after,
        ai_system_or_capability,
        human_role_change,
        system_integrations,
        deployment_stage,
        roi_metric,
        business_outcome,
        governance_or_risk_notes,
        implementation_details,
        source_title,
        source_url,
        source_name,
        publish_date,
        evidence_summary,
        confidence_score,
        created_at,
        raw_json
      FROM use_cases
      ORDER BY created_at DESC, company_name ASC, workflow_affected ASC
      LIMIT ?
    `,
  LIST_USE_CASES_BY_RUN: `
      SELECT
        id,
        run_id,
        company_name,
        industry,
        business_function,
        workflow_affected,
        workflow_before,
        workflow_after,
        ai_system_or_capability,
        human_role_change,
        system_integrations,
        deployment_stage,
        roi_metric,
        business_outcome,
        governance_or_risk_notes,
        implementation_details,
        source_title,
        source_url,
        source_name,
        publish_date,
        evidence_summary,
        confidence_score,
        created_at,
        raw_json
      FROM use_cases
      WHERE run_id = ?
      ORDER BY created_at DESC, company_name ASC, workflow_affected ASC
    `,
} as const;
