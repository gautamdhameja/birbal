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

export const SOURCES = {
  ARXIV: "arxiv",
  HACKER_NEWS: "hackernews",
} as const;

export const ARXIV = {
  RETRYABLE_STATUSES: [429, 503],
  RETRY_DELAY_MS: 1_000,
  MAX_ATTEMPTS: 3,
  REQUEST_INTERVAL_MS: 3_000,
  SEARCH_MODES: {
    PHRASE: "phrase",
    ALL_TERMS: "all-terms",
  },
  QUERY_PREFIX: "all",
  QUERY_OPERATOR: " AND ",
  QUERY_PARAMS: {
    SEARCH_QUERY: "search_query",
    START: "start",
    MAX_RESULTS: "max_results",
    SORT_BY: "sortBy",
    SORT_ORDER: "sortOrder",
  },
  QUERY_VALUES: {
    START: "0",
    SORT_BY: "submittedDate",
    SORT_ORDER: "descending",
  },
  LINK_REL: {
    ALTERNATE: "alternate",
  },
  ERRORS: {
    HTTP_FAILED_PREFIX: "arXiv request failed with HTTP",
    EXHAUSTED_RETRIES: "arXiv request failed after exhausting retry attempts.",
  },
} as const;

export type ArxivSearchMode = (typeof ARXIV.SEARCH_MODES)[keyof typeof ARXIV.SEARCH_MODES];

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

export const DAILY_READING = {
  TOPICS: [
    "LLM agents",
    "agent evaluation",
    "RAG systems",
    "local LLM inference",
    "llama.cpp",
    "vLLM",
    "AI engineering",
  ],
  MAX_RESULTS_PER_TOPIC: 5,
  MAX_CANDIDATES: 20,
  RATE_LIMIT_ERROR_FRAGMENT: "HTTP 429",
} as const;

export const DATABASE = {
  DIRECTORY: "data",
  FILE_NAME: "agent.db",
  JOURNAL_MODE: "journal_mode = WAL",
  ERRORS: {
    INVALID_RECENT_LIMIT: "listRecentItems limit must be a positive integer.",
  },
  SQL: {
    INIT_SCHEMA: `
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL,
        published_at TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_items_published_at ON items (published_at DESC);
    `,
    ITEM_EXISTS_BY_URL: "SELECT 1 FROM items WHERE url = ? LIMIT 1",
    UPSERT_ITEM: `
      INSERT INTO items (
        id,
        source,
        title,
        url,
        summary,
        published_at,
        raw_json
      )
      VALUES (
        @id,
        @source,
        @title,
        @url,
        @summary,
        @publishedAt,
        @rawJson
      )
      ON CONFLICT(url) DO UPDATE SET
        id = excluded.id,
        source = excluded.source,
        title = excluded.title,
        summary = excluded.summary,
        published_at = excluded.published_at,
        raw_json = excluded.raw_json,
        updated_at = CURRENT_TIMESTAMP
    `,
    LIST_RECENT_ITEMS: `
      SELECT id, source, title, url, summary, published_at, raw_json
      FROM items
      ORDER BY published_at DESC, title ASC
      LIMIT ?
    `,
  },
} as const;

export const OUTPUT = {
  JSON_INDENT_SPACES: 2,
} as const;

export const JSON_PARSING = {
  CHARS: {
    BACKSLASH: "\\",
    QUOTE: "\"",
    OPEN_BRACE: "{",
    CLOSE_BRACE: "}",
    NEWLINE: "\n",
    CARRIAGE_RETURN: "\r",
    TAB: "\t",
  },
  ESCAPES: {
    NEWLINE: "\\n",
    CARRIAGE_RETURN: "\\r",
    TAB: "\\t",
    UNICODE_PREFIX: "\\u",
  },
  CONTROL_CHAR_CODE_LIMIT: 0x20,
  UNICODE_RADIX: 16,
  UNICODE_PAD_LENGTH: 4,
  ERRORS: {
    INVALID_EXTRACTED_JSON_PREFIX: "No extracted agent response JSON object was valid:",
    NO_JSON_OBJECT: "Agent response is not valid JSON and no JSON object could be extracted.",
  },
} as const;

export const TOOLS = {
  GET_TIME: {
    NAME: "get_time",
    DESCRIPTION: "Get the current local time as an ISO string.",
  },
  SEARCH_ARXIV: {
    NAME: "search_arxiv",
    DESCRIPTION: "Search recent arXiv papers by query.",
  },
  SEARCH_HACKER_NEWS: {
    NAME: "search_hackernews",
    DESCRIPTION: "Search recent Hacker News stories by query.",
  },
  DEFAULT_MAX_RESULTS: 5,
  MAX_RESULTS_LIMIT: 10,
  PROMPT_LABELS: {
    NAME: "name",
    DESCRIPTION: "description",
    ARGS: "args",
  },
  RUNNER_EVENTS: {
    LOOKUP_FAILED: "tool.lookup.failed",
    ARGS_INVALID: "tool.args.invalid",
    RUN_START: "tool.run.start",
    RUN_SUCCESS: "tool.run.success",
    RUN_ERROR: "tool.run.error",
  },
  RUNNER_MESSAGES: {
    LOOKUP_FAILED: "tool lookup failed",
    ARGS_INVALID: "tool argument validation failed",
    RUN_START: "tool run started",
    RUN_SUCCESS: "tool run completed",
    RUN_ERROR: "tool run failed",
  },
  ERRORS: {
    UNKNOWN_PREFIX: "Unknown tool:",
    INVALID_ARGS_PREFIX: "Invalid args for tool",
  },
} as const;

export const AGENT = {
  DEFAULT_MAX_STEPS: 8,
  TOOL_RESULT_TYPE: "tool_result",
  ROLES: {
    SYSTEM: "system",
    USER: "user",
    ASSISTANT: "assistant",
  },
  RESPONSE_TYPES: {
    FINAL: "final",
    TOOL_CALL: "tool_call",
    CLARIFY: "clarify",
  },
  ERRORS: {
    INVALID_RESPONSE_PREFIX: "Agent returned an invalid response:",
    MAX_STEPS_PREFIX: "Agent stopped after reaching the maximum step limit of",
    CLARIFICATION_PREFIX: "Clarification needed:",
  },
  LOG_EVENTS: {
    RUN_START: "agent.run.start",
    HARNESS_TO_MODEL: "handoff.harness_to_model",
    MODEL_TO_HARNESS: "handoff.model_to_harness",
    RESPONSE_PARSE_FAILED: "agent.response.parse_failed",
    RESPONSE_PARSED: "agent.response.parsed",
    RUN_FINAL: "agent.run.final",
    RUN_CLARIFY: "agent.run.clarify",
    HARNESS_TO_TOOL: "handoff.harness_to_tool",
    TOOL_TO_HARNESS: "handoff.tool_to_harness",
    APPEND_TOOL_RESULT: "agent.messages.append_tool_result",
    MAX_STEPS: "agent.run.max_steps",
  },
  LOG_MESSAGES: {
    RUN_START: "agent run started",
    HARNESS_TO_MODEL: "sending messages to model",
    MODEL_TO_HARNESS: "received model response",
    RESPONSE_PARSE_FAILED: "model response failed protocol parsing",
    RESPONSE_PARSED: "parsed model response",
    RUN_FINAL: "agent run completed with final answer",
    RUN_CLARIFY: "agent run completed with clarification request",
    HARNESS_TO_TOOL: "dispatching tool call",
    TOOL_TO_HARNESS: "received tool result",
    APPEND_TOOL_RESULT: "appended tool result message",
    MAX_STEPS: "agent run reached max step limit",
  },
} as const;

export const LLAMA = {
  TEMPERATURE_MIN: 0,
  TEMPERATURE_MAX: 2,
  ERRORS: {
    REQUEST_FAILED_PREFIX: "Failed to reach llama-server at",
    HTTP_FAILED_PREFIX: "llama-server request failed with HTTP",
    INVALID_JSON_PREFIX: "llama-server returned invalid JSON:",
    INVALID_SHAPE_PREFIX: "llama-server returned an invalid chat completions response shape:",
    NO_CHOICES: "llama-server returned no chat completion choices.",
  },
} as const;

export const TIME = {
  DEFAULT_PAD_LENGTH: 2,
  MILLISECOND_PAD_LENGTH: 3,
  MINUTES_PER_HOUR: 60,
  POSITIVE_OFFSET_SIGN: "+",
  NEGATIVE_OFFSET_SIGN: "-",
  DATE_TIME_SEPARATOR: "T",
} as const;

export const PROMPTS = {
  SYSTEM_AGENT_PATH: "../../prompts/system-agent.txt",
  NO_TOOLS_AVAILABLE: "No tools are currently available.",
  AVAILABLE_TOOLS_HEADING: "Available tools:",
} as const;
