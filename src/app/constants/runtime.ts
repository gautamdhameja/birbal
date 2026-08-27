export const ENV_FILE_PATHS = [".env.local", ".env"];

export const CLI = {
  DEFAULT_TASK:
    "Research the most useful recent developments in LLM agent engineering and return a concise reading list.",
} as const;

export const LOGGING = {
  DEBUG_LEVEL: "debug",
  DEFAULT_LEVEL: "info",
  PRETTY_ENABLED_VALUE: "true",
  PRETTY_DESTINATION_FD: 2,
  PRETTY_IGNORED_FIELDS: "pid,hostname",
  PRETTY_TRANSLATE_TIME: "SYS:standard",
  LOGGER_NAME: "birbal",
} as const;

export const OUTPUT = {
  JSON_INDENT_SPACES: 2,
} as const;
