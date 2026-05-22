export const TOOLS = {
  GET_TIME: {
    NAME: "get_time",
    DESCRIPTION: "Get the current local time as an ISO string.",
  },
  SEARCH_ARXIV: {
    NAME: "search_arxiv",
    DESCRIPTION: "Search recent arXiv papers by query.",
  },
  SEARCH_HACKER_NEWS: {
    NAME: "search_hackernews",
    DESCRIPTION: "Search recent Hacker News stories by query.",
  },
  SEARCH_WEB: {
    NAME: "search_web",
    DESCRIPTION: "Search the web with Brave Search by query.",
  },
  SEARCH_SOURCE_DOMAIN: {
    NAME: "search_source_domain",
    DESCRIPTION: "Search a configured source domain with Brave Search.",
  },
  FETCH_URL_TEXT: {
    NAME: "fetch_url_text",
    DESCRIPTION: "Fetch a URL and extract readable article or report text.",
  },
  DEFAULT_MAX_RESULTS: 5,
  MAX_RESULTS_LIMIT: 10,
  RUN_TIMEOUT_MS: 30_000,
  PROMPT_LABELS: {
    NAME: "name",
    DESCRIPTION: "description",
    ARGS: "args",
  },
  RUNNER_EVENTS: {
    LOOKUP_FAILED: "tool.lookup.failed",
    ARGS_INVALID: "tool.args.invalid",
    RUN_START: "tool.run.start",
    RUN_SUCCESS: "tool.run.success",
    RUN_ERROR: "tool.run.error",
  },
  RUNNER_MESSAGES: {
    LOOKUP_FAILED: "tool lookup failed",
    ARGS_INVALID: "tool argument validation failed",
    RUN_START: "tool run started",
    RUN_SUCCESS: "tool run completed",
    RUN_ERROR: "tool run failed",
  },
  ERRORS: {
    UNKNOWN_PREFIX: "Unknown tool:",
    INVALID_ARGS_PREFIX: "Invalid args for tool",
    INVALID_RESULT_PREFIX: "Invalid result from tool",
    TIMEOUT_PREFIX: "Tool timed out after",
  },
} as const;
