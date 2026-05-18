export const ENV_FILE_PATHS = [".env.local", ".env"];

export const CLI = {
  TRACE_FLAG: "--trace",
  DEFAULT_TASK: "Say hello through the final response protocol.",
} as const;

export const LOGGING = {
  DEFAULT_LEVEL: "debug",
  PRETTY_ENABLED_VALUE: "true",
  PRETTY_DESTINATION_FD: 2,
  PRETTY_IGNORED_FIELDS: "pid,hostname",
  PRETTY_TRANSLATE_TIME: "SYS:standard",
  LOGGER_NAME: "birbal",
} as const;

export const HTTP = {
  USER_AGENT: "birbal/1.0 local-agent-harness",
  JSON_ACCEPT: "application/json",
  XML_ACCEPT: "application/atom+xml, application/xml, text/xml",
  CONTENT_TYPE_HEADER: "content-type",
  USER_AGENT_HEADER: "user-agent",
  JSON_CONTENT_TYPE: "application/json",
  POST_METHOD: "POST",
  FAILED_RESPONSE_BODY: "<failed to read response body>",
} as const;

export const OUTPUT = {
  JSON_INDENT_SPACES: 2,
} as const;
