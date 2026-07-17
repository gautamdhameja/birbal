export const ARXIV = {
  ALLOWED_HOSTS: ["export.arxiv.org"],
  RETRYABLE_STATUSES: [429, 503],
  RETRY_DELAY_MS: 1_000,
  MAX_ATTEMPTS: 3,
  REQUEST_INTERVAL_MS: 3_000,
  SEARCH_MODES: {
    PHRASE: "phrase",
    ALL_TERMS: "all-terms",
  },
  QUERY_PREFIX: "all",
  QUERY_OPERATOR: " AND ",
  QUERY_PARAMS: {
    SEARCH_QUERY: "search_query",
    START: "start",
    MAX_RESULTS: "max_results",
    SORT_BY: "sortBy",
    SORT_ORDER: "sortOrder",
  },
  QUERY_VALUES: {
    START: "0",
    SORT_BY: "submittedDate",
    SORT_ORDER: "descending",
  },
  LINK_REL: {
    ALTERNATE: "alternate",
  },
  ERRORS: {
    HTTP_FAILED_PREFIX: "arXiv request failed with HTTP",
  },
} as const;

export type ArxivSearchMode = (typeof ARXIV.SEARCH_MODES)[keyof typeof ARXIV.SEARCH_MODES];
