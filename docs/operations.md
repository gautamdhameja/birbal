# Operations

## Local Model Health

Before running model-backed pipelines, confirm llama.cpp is reachable:

```sh
curl http://127.0.0.1:8080/v1/models
```

If the endpoint is down, the agent CLI and extraction/scoring stages will fail.

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

### llama.cpp endpoint is unavailable

Symptom:

```text
Failed to reach llama-server at http://127.0.0.1:8080/v1/chat/completions
```

Fix: start the local llama.cpp server or update `LLAMA_SERVER_URL`.

### Page fetch blocked

Symptom:

```text
HTTP 403 Forbidden
```

This is expected for some publisher or consulting sites. Configure failure policy so the pipeline can continue when enough other items are available.

### PDF result

PDF extraction is intentionally not implemented yet. PDF URLs are returned as unsupported content type.
