// Purpose: Collects shared llama constants.
// Scope: Avoids scattering repeated literals across runtime modules.

export const LLAMA = {
  DEFAULT_REQUEST_TIMEOUT_MS: 120_000,
  TEMPERATURE_MIN: 0,
  TEMPERATURE_MAX: 2,
  RESPONSE_FORMATS: {
    JSON_OBJECT: "json_object",
  },
  ERRORS: {
    REQUEST_FAILED_PREFIX: "Failed to reach llama-server at",
    HTTP_FAILED_PREFIX: "llama-server request failed with HTTP",
    INVALID_JSON_PREFIX: "llama-server returned invalid JSON:",
    INVALID_SHAPE_PREFIX: "llama-server returned an invalid chat completions response shape:",
    NO_CHOICES: "llama-server returned no chat completion choices.",
  },
} as const;
