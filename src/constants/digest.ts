export const DIGEST = {
  DIRECTORY: "digests",
  FILE_EXTENSION: ".md",
  TOP_ITEMS: 5,
  TITLE: "Daily Reading Digest",
  SCORE_DECIMAL_PLACES: 2,
  SUMMARY_MAX_LENGTH: 400,
  EMPTY_SUMMARY: "No summary available.",
  INVALID_URL: "Invalid URL",
  DATE_PATTERN: /^\d{4}-\d{2}-\d{2}$/,
  LINE_SEPARATOR: "\n",
  ERRORS: {
    INVALID_DATE: "Digest date must be formatted as YYYY-MM-DD.",
  },
} as const;
