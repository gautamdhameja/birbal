# Model Adapters

The framework model contract lives in `src/framework/llm/types.ts`.

```ts
export type ModelClient = {
  complete(messages: ChatMessage[], options?: ModelCompleteOptions): Promise<string>;
};
```

The harness only needs a model client that returns text. It does not know which provider produced that text.

## Configured Provider

Birbal chooses the active provider from environment variables:

```sh
MODEL_PROVIDER=llama_cpp
```

Supported provider IDs:

- `llama_cpp`: local llama.cpp server, default.
- `openai`: hosted OpenAI API using `OPENAI_API_KEY`.

The selected provider is exposed through `getDefaultModelClient()` in `src/model-providers/default.ts`.

## llama.cpp Adapter

The llama.cpp adapter delegates to the shared OpenAI-compatible HTTP transport.

Required environment:

```sh
MODEL_PROVIDER=llama_cpp
LLAMA_SERVER_URL=http://127.0.0.1:8080/v1/chat/completions
LLAMA_MODEL=local
```

The local server must support OpenAI-style chat completions. When structured output is needed, Birbal sends:

```json
{ "response_format": { "type": "json_object" } }
```

## OpenAI Adapter

The hosted OpenAI adapter uses the same `ModelClient` contract and the same raw HTTP OpenAI-compatible transport, with bearer-token auth.

Required environment:

```sh
MODEL_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-...
```

Optional environment:

```sh
OPENAI_SERVER_URL=https://api.openai.com/v1/chat/completions
OPENAI_REQUEST_TIMEOUT_MS=120000
```

## Adding Another Adapter Later

Do not change the harness to add a provider. Add a new module that implements `ModelClient`:

```ts
export const myModelAdapter: ModelClient = {
  async complete(messages, options) {
    return "...";
  },
};
```

Then inject it into `createAgentHarness()` or into structured model calls. Keep provider-specific auth, URLs, request bodies, and response parsing inside the adapter.
