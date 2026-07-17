export const SCHEMA_SQL = {
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
        UNIQUE(source_url, company_name, ai_system_or_capability)
      );

      CREATE INDEX IF NOT EXISTS idx_use_cases_created_at
        ON use_cases (created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_use_cases_run_id
        ON use_cases (run_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS search_snapshots (
        id TEXT PRIMARY KEY,
        pipeline_id TEXT NOT NULL,
        query_count INTEGER NOT NULL,
        result_count INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_search_snapshots_pipeline_created_at
        ON search_snapshots (pipeline_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS search_snapshot_items (
        snapshot_id TEXT NOT NULL REFERENCES search_snapshots(id) ON DELETE CASCADE,
        rank INTEGER NOT NULL,
        query TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        description TEXT NOT NULL,
        published_at TEXT NOT NULL,
        source_name TEXT,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (snapshot_id, url)
      );

      CREATE INDEX IF NOT EXISTS idx_search_snapshot_items_snapshot_rank
        ON search_snapshot_items (snapshot_id, rank ASC);

      CREATE TABLE IF NOT EXISTS use_case_extraction_cache (
        cache_key TEXT PRIMARY KEY,
        source_url TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        extractor_version TEXT NOT NULL,
        use_cases_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_url, content_hash, extractor_version)
      );

      CREATE INDEX IF NOT EXISTS idx_use_case_extraction_cache_source
        ON use_case_extraction_cache (source_url, extractor_version);

      CREATE TABLE IF NOT EXISTS use_case_verification_cache (
        cache_key TEXT PRIMARY KEY,
        use_case_hash TEXT NOT NULL,
        evidence_hash TEXT NOT NULL,
        verifier_version TEXT NOT NULL,
        verification_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(use_case_hash, evidence_hash, verifier_version)
      );

      CREATE INDEX IF NOT EXISTS idx_use_case_verification_cache_use_case
        ON use_case_verification_cache (use_case_hash, verifier_version);
    `,
} as const;
