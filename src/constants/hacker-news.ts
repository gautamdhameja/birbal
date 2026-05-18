export const HACKER_NEWS = {
  STORY_TAG: "story",
  ITEM_URL_PREFIX: "https://news.ycombinator.com/item?id=",
  QUERY_PARAMS: {
    QUERY: "query",
    TAGS: "tags",
    HITS_PER_PAGE: "hitsPerPage",
  },
  ERRORS: {
    HTTP_FAILED_PREFIX: "Hacker News search request failed with HTTP",
  },
} as const;
