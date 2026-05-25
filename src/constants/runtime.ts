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

export const HTTP = {
  DEFAULT_TIMEOUT_MS: 30_000,
  DEFAULT_RETRIES: 2,
  RETRY_FACTOR: 2,
  RETRY_MIN_TIMEOUT_MS: 1_000,
  RETRY_MAX_TIMEOUT_MS: 10_000,
  RETRYABLE_STATUS_CODES: [429, 500, 502, 503, 504],
  MAX_RESPONSE_BYTES: 1_000_000,
  MAX_ERROR_RESPONSE_BYTES: 20_000,
  MAX_ERROR_BODY_MESSAGE_LENGTH: 500,
  USER_AGENT: "birbal/1.0 local-agent-harness",
  JSON_ACCEPT: "application/json",
  XML_ACCEPT: "application/atom+xml, application/xml, text/xml",
  CONTENT_TYPE_HEADER: "content-type",
  USER_AGENT_HEADER: "user-agent",
  JSON_CONTENT_TYPE: "application/json",
  POST_METHOD: "POST",
  FAILED_RESPONSE_BODY: "<failed to read response body>",
  ERRORS: {
    INVALID_HTTP_URL: "URL must use http or https and must not include credentials.",
    UNSAFE_HTTP_URL: "URL host is not safe for outbound fetching.",
    HOST_NOT_ALLOWED: "URL host is not allowed.",
    RESPONSE_TOO_LARGE: "HTTP response exceeded maximum allowed size.",
    TIMEOUT_PREFIX: "HTTP request timed out after",
    ABORTED: "HTTP request was aborted by the caller.",
  },
} as const;

export const OUTPUT = {
  JSON_INDENT_SPACES: 2,
} as const;
