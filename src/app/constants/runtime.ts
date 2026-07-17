export const ENV_FILE_PATHS = [".env.local", ".env"];

export const CLI = {
  DEFAULT_TASK: "Say hello through the final response protocol.",
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
