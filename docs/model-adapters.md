# Model Adapters

The framework model contract lives in `src/framework/llm/types.ts`.

```ts
export type ModelClient = {
  complete(messages: ChatMessage[], options?: ModelCompleteOptions): Promise<string>;
};
```

The harness only needs a model client that returns text. It does not know which provider produced that text.

## llama.cpp Adapter

Birbal currently ships one real adapter:

```ts
import { llamaCppModelAdapter } from "./src/llama/index.js";
```

The adapter delegates to the llama.cpp-compatible HTTP client in `src/llama/client.ts`.

Required environment:

```sh
LLAMA_SERVER_URL=http://127.0.0.1:8080/v1/chat/completions
LLAMA_MODEL=local
```

The local server must support OpenAI-style chat completions. When structured output is needed, Birbal sends:

```json
{ "response_format": { "type": "json_object" } }
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
