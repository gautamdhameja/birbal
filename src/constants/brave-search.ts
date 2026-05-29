// Purpose: Collects shared brave search constants.
// Scope: Avoids scattering repeated literals across runtime modules.

export const BRAVE_SEARCH = {
  WEB_SEARCH_URL: "https://api.search.brave.com/res/v1/web/search",
  ALLOWED_HOSTS: ["api.search.brave.com"],
  RESULT_FILTERS: {
    WEB: "web",
  },
  HEADERS: {
    SUBSCRIPTION_TOKEN: "X-Subscription-Token",
  },
  QUERY_PARAMS: {
    QUERY: "q",
    COUNT: "count",
    FRESHNESS: "freshness",
    RESULT_FILTER: "result_filter",
  },
  DEFAULT_MAX_RESULTS: 10,
  DEFAULT_MAX_CALLS_PER_PROCESS: 50,
  MAX_RESULTS_LIMIT: 20,
  RETRIES: 0,
  ERRORS: {
    MISSING_API_KEY: "BRAVE_SEARCH_API_KEY is required to use search_web.",
    QUOTA_EXCEEDED: "Brave Search process quota exceeded.",
    RATE_LIMIT_CIRCUIT_OPEN: "Brave Search circuit is open after a rate limit response.",
    HTTP_FAILED_PREFIX: "Brave Search request failed with HTTP",
  },
} as const;
