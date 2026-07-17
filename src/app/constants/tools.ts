// Purpose: Collects shared tools constants.
// Scope: Avoids scattering repeated literals across runtime modules.

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
} as const;
