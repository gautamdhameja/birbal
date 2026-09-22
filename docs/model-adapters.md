# Model Adapters

All providers implement the framework `ModelClient` contract.

The default adapter uses a llama.cpp-compatible chat-completions endpoint. The OpenAI adapter uses
hosted chat completions and requires an API key. Both share request validation, timeout handling,
response diagnostics, and JSON response-format support.

Select the provider with `MODEL_PROVIDER=llama_cpp` or `MODEL_PROVIDER=openai`. Environment
configuration supplies the provider, endpoint, model, credential, and model request timeout:
`MODEL_PROVIDER`, `MODEL_BASE_URL`, `MODEL_NAME`, `MODEL_API_KEY`, and
`MODEL_REQUEST_TIMEOUT_MS`. Structured-output compatibility is configured separately with
`MODEL_RESPONSE_FORMAT=json_object|json_schema`. When using Apple's `fm serve`, also set
`MODEL_JSON_SCHEMA_DIALECT=apple`; other endpoints default to the `standard` dialect. Standard
schemas use a provider-compatible root object with non-strict enforcement, then Birbal applies its
original Zod validation locally. Apple schemas retain strict enforcement and Foundation
Models-specific object metadata.

The structured-completion output limit is not environment-configured.
Birbal's structured model completion defaults set `maxOutputTokens` from
`FRAMEWORK_AGENT.MODEL_MAX_TOKENS`, currently 1,000 tokens. In `json_schema` mode, each call adds
the schema that already validates its response instead of sharing one global response schema.
