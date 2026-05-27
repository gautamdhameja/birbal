# Pipeline Framework

The pipeline framework lives in `src/framework/pipeline/`.

It is designed for deterministic, repeatable workflows where a model may be one component, but the model does not control the whole process.

## Pipeline Stages

The generic orchestrator runs:

1. Load pipeline config.
2. Create run metadata.
3. Load source registry.
4. Resolve configured components.
5. Collect candidates.
6. Fetch and optionally extract content.
7. Score items if configured.
8. Classify or extract structured data if configured.
9. Select output items.
10. Render an artifact.
11. Write the artifact.
12. Finish run metadata.

## Component Interfaces

Pipeline components are registered by ID:

- `SourceCollector`
- `ContentFetcher`
- `ContentExtractor`
- `Scorer`
- `Classifier`
- `StructuredExtractor`
- `Selector`
- `Renderer`
- `ArtifactWriter`

The registry is generic. It does not know what a daily digest or enterprise use case is.

## Config Driven Behavior

Pipeline config lives in `config/pipelines/*.json`.

```json
{
  "pipelineId": "use_cases",
  "collectionMethods": [
    {
      "id": "open_web_search",
      "collectorId": "brave_web_search_collector"
    }
  ],
  "contentFetchPolicy": {
    "enabled": true,
    "fetcherId": "url_text_fetcher",
    "fetchForTopN": 30,
    "maxChars": 24000,
    "preferFetchedContent": true
  },
  "structuredExtractorId": "enterprise_use_case_extractor",
  "selectorId": "enterprise_use_case_selector",
  "rendererId": "enterprise_use_case_markdown_renderer"
}
```

## Failure Policy

Each pipeline has a failure policy:

- `failFast`
- `continueOnSourceFailure`
- `continueOnContentFetchFailure`
- `continueOnScoringFailure`
- `continueOnStructuredExtractionFailure`
- `minItemsRequiredForSuccess`

This lets one pipeline tolerate partial source failures while another stops immediately if its model extraction stage is unavailable.

## Run Store

The framework exposes a `PipelineRunStore` interface and an in-memory implementation. Birbal injects a SQLite implementation from `src/db/pipelineRuns.ts`.
