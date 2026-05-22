export const DAILY_READING = {
  MAX_RESULTS_PER_TOPIC: 5,
  MAX_CANDIDATES: 20,
  RATE_LIMIT_STATUS: 429,
  LOG_EVENTS: {
    SOURCES_USED: "daily.sources.used",
  },
  LOG_MESSAGES: {
    SOURCES_USED: "daily sources selected",
  },
} as const;
