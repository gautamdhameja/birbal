# Birbal Research App

The Birbal app is the concrete enterprise AI scout built on the framework.

## Daily Pipeline

Command:

```sh
birbal daily
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
birbal use-cases
```

Purpose:

- Search for real enterprise AI deployments.
- Fetch shortlisted source URLs.
- Extract structured use-case records with the configured model provider.
- Select diverse, high-confidence use cases.
- Verify selected use cases against the source URL and bounded linked evidence.
- Store use cases in SQLite.
- Write Markdown under `digests/use-cases/`.

For prompt and model iteration, split search from processing:

```sh
birbal use-cases search
birbal use-cases process --snapshot latest
```

`search` consumes Brave Search quota and stores a reusable snapshot of URLs. `process` uses a stored snapshot and runs fetching, extraction, verification, selection, storage, and rendering without making new Brave Search calls.

## Component Registration

Birbal composes app component bundles in `src/pipelines/register.ts`.

This keeps `src/framework/` generic. The framework knows only that a pipeline needs a collector, fetcher, extractor, selector, renderer, and writer. The Birbal app decides what those components mean.

## Runtime Data

Generated local data is ignored by Git:

- `data/agent.db`
- `digests/`

Treat this as local research state. It may contain fetched page text, raw source payloads, model scores, extracted use cases, and run metadata.
