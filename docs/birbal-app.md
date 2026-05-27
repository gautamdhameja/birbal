# Birbal Research App

The Birbal app is the concrete enterprise AI scout built on the framework.

## Daily Pipeline

Command:

```sh
npm run daily
```

Purpose:

- Collect enterprise AI reading candidates.
- Fetch content for top candidates.
- Score with the enterprise daily rubric.
- Classify into digest categories.
- Select a balanced digest.
- Write Markdown under `digests/`.

## Use Cases Pipeline

Command:

```sh
npm run use-cases
```

Purpose:

- Search for real enterprise AI deployments.
- Fetch shortlisted source URLs.
- Extract structured use-case records with the local model.
- Select diverse, high-confidence use cases.
- Store use cases in SQLite.
- Write Markdown under `digests/use-cases/`.

## Component Registration

Birbal registers app components in `src/pipelines/register.ts`.

This keeps `src/framework/` generic. The framework knows only that a pipeline needs a collector, fetcher, extractor, selector, renderer, and writer. The Birbal app decides what those components mean.

## Runtime Data

Generated local data is ignored by Git:

- `data/agent.db`
- `digests/`

Treat this as local research state. It may contain fetched page text, raw source payloads, model scores, extracted use cases, and run metadata.
