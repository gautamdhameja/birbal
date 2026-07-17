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
    "maxChars": 16000,
    "maxResponseBytes": 8000000,
    "preferFetchedContent": true
  },
  "structuredExtractorId": "enterprise_use_case_extractor",
  "selectorId": "enterprise_use_case_selector",
  "rendererId": "enterprise_use_case_markdown_renderer",
  "limits": {
    "maxCandidates": 50,
    "maxCandidatesForExtraction": 50,
    "maxItemAgeDays": 365,
    "maxResults": 5
  }
}
```

`maxResponseBytes` caps the raw downloaded page body. It is useful for article and report
pages that include large HTML, scripts, or embedded page data. `maxChars` is separate: it
caps the extracted plain text passed to later model or renderer stages.

Pipeline-specific `limits` can further control model cost. The use-cases pipeline uses:

- `maxCandidates`: caps the deduplicated search results entering the pipeline.
- `maxCandidatesForExtraction`: caps the search collector output before content fetching.
- `maxSearchQueries`: caps search calls per use-case search attempt. The use-case CLI can repeat
  bounded search attempts through `settings.searchRetry.maxAttempts`, stopping early when selection
  reaches the requested report size.
- `maxResults`: caps the final rendered output count. CLI `--limit` maps here and does not shrink
  the upstream candidate pool.
- `maxItemAgeDays`: filters search candidates and extracted use cases older than the configured
  age window before newsletter output.
- Search candidates are ranked by enterprise use-case relevance before domain priority and recency,
  so customer stories and production deployment pages are fetched before generic AI commentary.
- `extractionMaxContentChars`: caps article text included in each extraction prompt.
- `verificationBatchSize`: verifies candidates in batches and stops once enough are accepted.
- `verificationCandidateMultiplier`: controls the maximum over-selected verification pool.
- `maxVerificationLinks`: controls linked evidence fetched and included for verification.
- `verificationPromptSourceMaxChars` and `verificationPromptLinkedMaxChars`: cap evidence text
  included in verification prompts.

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

The framework exposes a `PipelineRunStore` interface and an in-memory implementation. Birbal injects a SQLite implementation from `src/app/db/pipelineRuns.ts`.
