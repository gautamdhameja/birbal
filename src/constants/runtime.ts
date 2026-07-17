// Purpose: Collects shared runtime constants.
// Scope: Avoids scattering repeated literals across runtime modules.

export { HTTP } from "../framework/network/constants.js";

export const ENV_FILE_PATHS = [".env.local", ".env"];

export const CLI = {
  TRACE_FLAG: "--trace",
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
  PREVIEW_MAX_LENGTH: 500,
} as const;

export const OUTPUT = {
  JSON_INDENT_SPACES: 2,
} as const;
