# Configuration

## Research preferences

`config/research.json` contains:

- `interests`
- `avoid`
- `preferredDifficulty`
- `maxReadingListItems`

## Curated sources

`config/source-registry.json` gives each source an ID, display name, domain list, priority, source type, suggested queries, and enabled flag. The source-domain tool accepts these IDs and filters results back to configured domains.

## Environment

`.env.local` takes precedence over `.env`. Environment variables configure the model provider, model URL and ID, API keys, search quota, HTTP limits, and logging.
