# Model Adapters

All providers implement the framework `ModelClient` contract.

The default adapter uses a llama.cpp-compatible chat-completions endpoint. The OpenAI adapter uses hosted chat completions and requires an API key. Both share request validation, timeout handling, response diagnostics, and JSON response-format support.

Select the provider with `MODEL_PROVIDER=llama` or `MODEL_PROVIDER=openai`. Provider endpoints, models, credentials, and token limits come from environment variables.
