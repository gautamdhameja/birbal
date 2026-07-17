export const FRAMEWORK_TOOLS = {
  RUN_TIMEOUT_MS: 30_000,
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
    INVALID_RESULT_PREFIX: "Invalid result from tool",
    TIMEOUT_PREFIX: "Tool timed out after",
  },
} as const;
