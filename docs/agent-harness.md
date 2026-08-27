# Agent Harness

`createAgentHarness()` composes a model client, tool runner, rendered tool definitions, response
parser, prompt builder, lifecycle hooks, and model options.

The protocol supports two response shapes:

```json
{ "type": "tool_call", "tool": "search_web", "args": { "query": "agent evals" } }
```

```json
{ "type": "final", "answer": "## Reading list\n..." }
```

Protocol-repair attempts are configurable with `maxParseRepairAttempts`. The generic harness
defaults to zero attempts. Birbal's reading-list agent composition opts into one repair attempt;
the Architecture Case Lab research runner does the same for its use of the harness.

Tool calls and results remain in message history. The harness validates step limits before the
first model call and emits structured lifecycle events. Structured, schema-validated model phases
outside the harness use `completeStructuredWithRepair()` and its separate repair contract.
