# Agent Harness

`createAgentHarness()` composes a model client, tool runner, rendered tool definitions, response parser, prompt builder, lifecycle hooks, and model options.

The protocol supports two response shapes:

```json
{ "type": "tool_call", "tool": "search_web", "args": { "query": "agent evals" } }
```

```json
{ "type": "final", "answer": "## Reading list\n..." }
```

Invalid model responses receive one configurable repair attempt. Tool calls and results remain in message history. The harness validates step limits before the first model call and emits structured lifecycle events.
