// Purpose: Collects shared model provider constants.
// Scope: Keeps provider IDs, defaults, and error messages in one integration-focused module.

export const MODEL_PROVIDERS = {
  DEFAULT_PROVIDER: "llama_cpp",
  PROVIDERS: {
    LLAMA_CPP: "llama_cpp",
    OPENAI: "openai",
  },
  DEFAULT_REQUEST_TIMEOUT_MS: 120_000,
  DEFAULT_OPENAI_SERVER_URL: "https://api.openai.com/v1/chat/completions",
  TEMPERATURE_MIN: 0,
  TEMPERATURE_MAX: 2,
  RESPONSE_FORMATS: {
    JSON_OBJECT: "json_object",
  },
  ERRORS: {
    UNSUPPORTED_PROVIDER: "Unsupported model provider",
    REQUEST_FAILED_PREFIX: "Failed to reach model provider at",
    HTTP_FAILED_PREFIX: "Model provider request failed with HTTP",
    INVALID_JSON_PREFIX: "Model provider returned invalid JSON:",
    INVALID_SHAPE_PREFIX: "Model provider returned an invalid chat completions response shape:",
    NO_CHOICES: "Model provider returned no chat completion choices.",
    OPENAI_API_KEY_REQUIRED: "OPENAI_API_KEY is required when MODEL_PROVIDER=openai.",
  },
} as const;
