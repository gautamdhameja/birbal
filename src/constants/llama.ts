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
