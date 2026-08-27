# Model Adapters

All providers implement the framework `ModelClient` contract.

The default adapter uses a llama.cpp-compatible chat-completions endpoint. The OpenAI adapter uses
hosted chat completions and requires an API key. Both share request validation, timeout handling,
response diagnostics, and JSON response-format support.

Select the provider with `MODEL_PROVIDER=llama_cpp` or `MODEL_PROVIDER=openai`. Environment
configuration supplies the provider, endpoint, model, credential, and model request timeout:
`MODEL_PROVIDER`, `MODEL_BASE_URL`, `MODEL_NAME`, `MODEL_API_KEY`, and
`MODEL_REQUEST_TIMEOUT_MS`.

The structured-completion output limit is not environment-configured.
`STRUCTURED_MODEL_COMPLETION_OPTIONS` sets `maxOutputTokens` from
`FRAMEWORK_AGENT.MODEL_MAX_TOKENS`, currently 1,000 tokens, for Birbal's structured model calls.
