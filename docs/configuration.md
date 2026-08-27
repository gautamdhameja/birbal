# Configuration

## Research preferences

`config/research.json` contains:

- `interests`
- `avoid`
- `preferredDifficulty`
- `maxReadingListItems`

## Curated sources

`config/source-registry.json` gives each source an ID, display name, domain list, source type, and enabled flag. The source-domain tool accepts enabled source IDs and filters results back to configured domains.

## Environment

`.env.local` takes precedence over `.env`. Environment variables configure the model provider, model URL and ID, API keys, search quota, HTTP limits, and logging. Set `RESEARCH_CONFIG_PATH` or `SOURCE_REGISTRY_PATH` to load configuration from another location; otherwise Birbal uses its bundled files.
