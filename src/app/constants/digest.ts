export const DIGEST = {
  TITLE: "Daily Reading Digest",
  SCORE_DECIMAL_PLACES: 2,
  SUMMARY_MAX_LENGTH: 400,
  SUMMARY_LINES: 5,
  EMPTY_SUMMARY: "No summary available.",
  UNKNOWN_FIELD: "Not specified in the source.",
  INVALID_URL: "Invalid URL",
  DATE_PATTERN: /^\d{4}-\d{2}-\d{2}$/,
  LINE_SEPARATOR: "\n",
  ERRORS: {
    INVALID_DATE: "Digest date must be formatted as YYYY-MM-DD.",
  },
} as const;
