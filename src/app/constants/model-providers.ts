export const MODEL_PROVIDERS = {
  DEFAULT_PROVIDER: "llama_cpp",
  PROVIDERS: {
    LLAMA_CPP: "llama_cpp",
    OPENAI: "openai",
  },
  CHAT_COMPLETIONS_PATH: "/v1/chat/completions",
  DEFAULT_REQUEST_TIMEOUT_MS: 120_000,
  DEFAULT_LLAMA_BASE_URL: "http://127.0.0.1:8080",
  DEFAULT_OPENAI_BASE_URL: "https://api.openai.com",
  TEMPERATURE_MIN: 0,
  TEMPERATURE_MAX: 2,
  RESPONSE_FORMATS: {
    JSON_OBJECT: "json_object",
  },
  OUTPUT_TOKEN_PARAMETERS: {
    MAX_TOKENS: "max_tokens",
    MAX_COMPLETION_TOKENS: "max_completion_tokens",
  },
  ERRORS: {
    UNSUPPORTED_PROVIDER: "Unsupported model provider",
    REQUEST_FAILED_PREFIX: "Failed to reach model provider at",
    HTTP_FAILED_PREFIX: "Model provider request failed with HTTP",
    INVALID_JSON_PREFIX: "Model provider returned invalid JSON:",
    INVALID_SHAPE_PREFIX: "Model provider returned an invalid chat completions response shape:",
    NO_CHOICES: "Model provider returned no chat completion choices.",
    MODEL_NAME_REQUIRED: "MODEL_NAME is required for the configured model provider.",
    MODEL_API_KEY_REQUIRED: "MODEL_API_KEY is required when MODEL_PROVIDER=openai.",
  },
} as const;
