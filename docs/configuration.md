# Configuration

Birbal uses environment variables for runtime clients and JSON files for app behavior.

## Environment Variables

Common local variables:

```sh
MODEL_PROVIDER=llama_cpp
LLAMA_SERVER_URL=http://127.0.0.1:8080/v1/chat/completions
LLAMA_MODEL=local
LLAMA_REQUEST_TIMEOUT_MS=120000
BRAVE_SEARCH_API_KEY=...
LOG_LEVEL=info
LOG_PRETTY=true
```

Environment variables are loaded from `.env.local` and `.env`.

Use hosted OpenAI instead of the local model with:

```sh
MODEL_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-...
OPENAI_REQUEST_TIMEOUT_MS=120000
```

## Source Registry

`config/source-registry.json` defines research sources:

- `id`
- `name`
- `domains`
- `priority`
- `sourceType`
- `searchQueries`
- `enabled`

Pipeline collectors use this registry to know which domains and queries belong to each source.

## Preferences

`config/preferences.json` defines research preferences, avoid terms, difficulty, source mix, and thresholds.

## Pipeline Configs

Pipeline configs live under `config/pipelines/`.

Current configs:

- `daily.json`
- `use-cases.json`

You can dry-run a config:

```sh
birbal pipeline use_cases --dry-run
```

You can pass a custom path:

```sh
birbal pipeline --config ./my-pipeline.json --dry-run
```
