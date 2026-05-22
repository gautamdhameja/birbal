export const DATABASE = {
  DIRECTORY: "data",
  FILE_NAME: "agent.db",
  FOREIGN_KEYS: "foreign_keys = ON",
  JOURNAL_MODE: "journal_mode = WAL",
  ERRORS: {
    INVALID_LIMIT: "limit must be a positive integer.",
  },
  ITEM_COLUMNS: {
    SOURCE: "source",
    SOURCE_ID: "source_id",
    SOURCE_NAME: "source_name",
    SOURCE_TYPE: "source_type",
    DISCOVERED_AT: "discovered_at",
    CONTENT_TEXT: "content_text",
    CONTENT_FETCH_STATUS: "content_fetch_status",
    CATEGORY: "category",
  },
  SCORE_COLUMNS: {
    ENTERPRISE_RELEVANCE: "enterprise_relevance",
    WORKFLOW_REDESIGN_DEPTH: "workflow_redesign_depth",
    REAL_USE_CASE_SPECIFICITY: "real_use_case_specificity",
    DEPLOYMENT_FDE_RELEVANCE: "deployment_fde_relevance",
    BUSINESS_OUTCOME_CLARITY: "business_outcome_clarity",
    TECHNICAL_IMPLEMENTATION_USEFULNESS: "technical_implementation_usefulness",
    RECENCY: "recency",
    NON_GENERIC_INSIGHT: "non_generic_insight",
    REJECTED: "rejected",
    REJECTION_REASON: "rejection_reason",
  },
  SQL: {
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
  },
} as const;
