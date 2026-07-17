// Purpose: Collects shared database configuration constants.
// Scope: Keeps runtime database settings separate from domain-owned SQL statements.

export const DATABASE = {
  DIRECTORY: "data",
  FILE_NAME: "agent.db",
  FOREIGN_KEYS: "foreign_keys = ON",
  JOURNAL_MODE: "journal_mode = WAL",
  ERRORS: {
    INVALID_LIMIT: "limit must be a positive integer.",
  },
  RUN_STATUSES: {
    SUCCESS: "success",
    PARTIAL_SUCCESS: "partial_success",
    FAILED: "failed",
  },
  RUN_TYPES: {
    MANUAL: "manual",
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
} as const;
