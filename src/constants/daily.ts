export const DAILY_READING = {
  MAX_RESULTS_PER_TOPIC: 5,
  MAX_CANDIDATES: 20,
  RATE_LIMIT_STATUS: 429,
  LOG_EVENTS: {
    SOURCES_USED: "daily.sources.used",
    DIGEST_SELECTION: "daily.digest.selection",
  },
  LOG_MESSAGES: {
    SOURCES_USED: "daily sources selected",
    DIGEST_SELECTION: "daily digest selection trace",
  },
  TRACE_SELECTION_FLAG: "--trace-selection",
  MAX_SELECTION_TRACE_SKIPPED_ITEMS: 8,
} as const;
