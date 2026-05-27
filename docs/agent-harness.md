# Agent Harness

The reusable agent harness lives in `src/framework/agent/`.

Its job is to manage the loop between a task, a model, a protocol parser, and a tool executor. The harness is dependency-injected, so it does not require Birbal's tools or llama.cpp specifically.

## Protocol

The default JSON protocol supports three response types:

```json
{ "type": "final", "answer": "..." }
```

```json
{ "type": "clarify", "question": "..." }
```

```json
{ "type": "tool_call", "tool": "get_time", "args": {} }
```

The model response is parsed and validated before the harness takes action. If the response is invalid, the harness returns a clear invalid-response message instead of executing unsafe or ambiguous behavior.

## Creating A Harness

```ts
import { createAgentHarness, parseJsonAgentResponse } from "./src/framework/index.js";

const runAgent = createAgentHarness({
  modelClient,
  toolRunner,
  buildSystemPrompt: (tools) => `Return strict JSON only.\n\nTools:\n${tools}`,
  renderToolsForPrompt,
  parseResponse: parseJsonAgentResponse,
  defaultMaxSteps: 8,
});

const answer = await runAgent("Use a tool to get the current time.");
```

## Lifecycle Hooks

The harness exposes hooks for observability and integration:

- `beforeModelCall`
- `afterModelCall`
- `onParseFailure`
- `onResponseParsed`
- `beforeToolCall`
- `afterToolCall`
- `onMaxSteps`

Use hooks for tracing, metrics, debugging, or external run capture. Avoid putting core business behavior in hooks; that belongs in tools, components, or the model protocol.

## Trace IDs

Each agent run gets a `traceId`. Each model pass gets a `modelPassId`. Tool calls receive both IDs so logs can connect:

```text
harness -> model -> harness -> tool -> harness -> model
```
