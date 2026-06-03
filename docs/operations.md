# Operations

## Model Provider Health

For the default local provider, confirm llama.cpp is reachable:

```sh
curl http://127.0.0.1:8080/v1/models
```

If the endpoint is down, the agent CLI and extraction/scoring stages will fail.

For hosted OpenAI, confirm these variables are set:

```sh
MODEL_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-...
```

## Trace Logs

Use trace mode for detailed handoff logs:

```sh
birbal agent --trace "Use a tool to get the current time."
birbal pipeline use_cases --trace
```

Logs include:

- pipeline run start and finish
- stage start and finish
- model call start and failure
- agent harness handoffs
- tool execution handoffs

## Brave Search Quota

The use-case pipeline is configured for a small fixed query set. The default use-case pipeline runs up to five Brave Search queries per run.

Check `config/pipelines/use-cases.json`:

- `limits.maxSearchQueries`
- `limits.maxSearchResultsPerQuery`

## Common Failures

### Model endpoint is unavailable

Symptom:

```text
Failed to reach model provider at http://127.0.0.1:8080/v1/chat/completions
```

Fix: start the local llama.cpp server or update `LLAMA_SERVER_URL`. If using OpenAI, check `OPENAI_API_KEY`, `OPENAI_MODEL`, and network access.

### Page fetch blocked

Symptom:

```text
HTTP 403 Forbidden
```

This is expected for some publisher or consulting sites. Configure failure policy so the pipeline can continue when enough other items are available.

### PDF result

PDF extraction is intentionally not implemented yet. PDF URLs are returned as unsupported content type.
