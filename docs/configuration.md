# Configuration

Birbal uses environment variables for runtime clients and JSON files for app behavior.

## Environment Variables

Common local variables:

```sh
LLAMA_SERVER_URL=http://127.0.0.1:8080/v1/chat/completions
LLAMA_MODEL=local
LLAMA_REQUEST_TIMEOUT_MS=120000
BRAVE_SEARCH_API_KEY=...
LOG_LEVEL=info
LOG_PRETTY=true
```

Environment variables are loaded from `.env.local` and `.env`.

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
npm run run-pipeline -- use_cases --dry-run
```

You can pass a custom path:

```sh
npm run run-pipeline -- --config ./my-pipeline.json --dry-run
```
