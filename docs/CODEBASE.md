# Birbal Codebase

Birbal is a TypeScript research and automation harness for local-LLM-assisted enterprise AI scouting. The codebase started as a small agent loop around a llama.cpp-compatible chat completions endpoint, and now also includes a config-driven pipeline framework for collecting, enriching, scoring, extracting, selecting, and rendering research artifacts.

The main production-like workflows are:

- A daily enterprise AI reading digest pipeline (`daily`) that collects candidates from configured sources, fetches source text, scores and classifies items with a local LLM, selects a balanced digest mix, persists results, and writes Markdown under `digests/`.
- An enterprise AI use-case scout pipeline (`use_cases`) that searches web sources, fetches article text, extracts structured enterprise use cases with a local LLM, selects a diverse set, stores them in SQLite, and writes Markdown under `digests/use-cases/`.
- A lightweight agent CLI (`src/cli.ts` and `src/main.ts`) that runs a JSON-protocol chat agent with handwritten tools.

The project is intentionally modular. Runtime configuration is loaded from environment variables and JSON config files. Shared shapes are validated with Zod. LLM calls, tool registration, pipeline orchestration, source clients, storage, prompts, constants, and renderers live in separate modules.

## Runtime Entry Points

### Top-Level CLI

`src/cli.ts` powers the package `birbal` executable and routes:

- `birbal agent [task...]`
- `birbal daily`
- `birbal use-cases`
- `birbal use cases`
- `birbal pipeline <pipelineId>`

The package binary is `bin/birbal.js`, which launches the TypeScript CLI through the local `tsx` runtime for repo-local use.

### Agent CLI

`src/main.ts` remains the agent-only entry point for compatibility, while `npm run dev` now routes through `src/cli.ts agent`.

It:

1. Loads `.env.local` and `.env` through `dotenv`.
2. Parses a task and optional `--trace` flag with `commander`.
3. Enables debug logging when tracing is requested.
4. Dynamically imports `runAgent` and the tool registry.
5. Runs the task through the agent loop and prints the final answer.

The default task is `Say hello through the final response protocol.`

### Pipeline CLI

`src/runPipeline.ts` contains reusable pipeline CLI execution helpers used by:

- `birbal pipeline <pipelineId>`
- `birbal daily`
- `birbal use-cases`
- `npm run run-pipeline -- <pipelineId>`
- `npm run daily`
- `npm run use-cases`

It supports:

- `--trace` for debug logs.
- `--dry-run` to print the resolved pipeline config.
- `--limit <number>` to cap candidate/output counts and content fetch volume.
- `--config <path>` to load a custom JSON config file.

Pipeline IDs are resolved from `config/pipelines/<id>.json`, with underscore-to-hyphen fallback. For example, `use_cases` resolves to `config/pipelines/use-cases.json`.

## Package Scripts

`package.json` defines:

- `npm run cli`: run the top-level CLI via `tsx src/cli.ts`.
- `npm run dev`: wrapper for `birbal agent`.
- `npm run run-pipeline`: wrapper for `birbal pipeline`.
- `npm run daily`: wrapper for `birbal daily`.
- `npm run use-cases`: wrapper for `birbal use-cases`.
- `npm run format` / `format:check`: Prettier write/check.
- `npm run lint` / `lint:fix`: ESLint.
- `npm run typecheck`: `tsc --noEmit`.
- `npm test`: Node test runner through `tsx --test tests/**/*.test.ts` with silent logs.
- `npm run check`: format check, lint, typecheck, then tests.

TypeScript is configured for strict ESM (`"type": "module"`, `moduleResolution: "NodeNext"`, strict mode, and `noUncheckedIndexedAccess`).

## Directory Structure

Top-level files:

- `README.md`: short project description.
- `AGENTS.md`: engineering rules for contributors and agents.
- `package.json` / `package-lock.json`: npm metadata and pinned dependency graph.
- `tsconfig.json`: strict TypeScript configuration.
- `eslint.config.js`: ESLint rules for source and tests.
- `prompts/system-agent.txt`: base prompt for the JSON-protocol agent.

Configuration:

- `config/preferences.json`: user interests, avoid terms, scoring thresholds, source mix, and academic fallback preference.
- `config/source-registry.json`: configured research sources, source domains, source types, search queries, priorities, and enablement.
- `config/pipelines/daily.json`: current daily digest pipeline definition.
- `config/pipelines/use-cases.json`: current enterprise use-case pipeline definition.

Source folders:

- `src/agent/`: JSON-protocol agent loop, prompts, response schemas, and parsing.
- `src/arxiv/`, `src/hackernews/`, `src/brave-search/`: source/search clients and environment config.
- `src/config/`: JSON config loading for source registries.
- `src/constants/`: domain-specific constants grouped by responsibility.
- `src/daily/`: daily candidate collection, LLM scoring, classification, digest selection, and digest rendering.
- `src/db/`: SQLite persistence for items, scores, pipeline runs, and enterprise use cases.
- `src/framework/`: reusable framework modules for agent harness orchestration, tools, model contracts, pipelines, LLM JSON repair, scoring rubrics, content fetching, and network fetch helpers.
- `src/http/`: HTTP response helpers and URL safety checks.
- `src/llama/`: llama.cpp-compatible chat completion client, framework adapter, schemas, and env config.
- `src/logging/`: Pino logger and safe preview helper.
- `src/memory/`: user preference schema and loader.
- `src/pipelines/register.ts`: Birbal-specific pipeline component registration.
- `src/pipelines/daily/`: current daily rubric.
- `src/pipelines/useCases/`: enterprise use-case search, schema, extractor, selector, and renderer.
- `src/source-search/`: domain-constrained Brave Search helper.
- `src/tools/`: Birbal agent tool definitions, registry, and executor adapter.
- `src/url-text/`: HTML text extraction and URL text wrapper.
- `src/utils/`: JSON, date, and URL helpers.

Tests:

- `tests/*.test.ts`: unit and integration-style tests for agent behavior, source clients, pipeline config/registry/orchestration, concurrency, LLM repair, scoring, classification, daily digest behavior, URL fetching, preferences, DB storage, and use-case extraction/rendering/selection/storage.

Generated runtime data is intentionally outside source:

- `data/agent.db`: default SQLite database.
- `digests/*.md`: daily digest outputs.
- `digests/use-cases/*.md`: enterprise use-case digest outputs.

The SQLite database is local runtime state and may include fetched article text, raw source payloads, model scores, and extracted use-case records. Treat `data/agent.db` as sensitive local research data; it is ignored by Git and should not be shared without review.

## Configuration Model

Birbal uses two kinds of configuration.

Environment variables configure runtime clients:

- `LLAMA_SERVER_URL`: llama.cpp-compatible chat completions endpoint. Must be HTTP(S), valid, and without credentials.
- `LLAMA_MODEL`: model name sent in chat completion requests.
- `LLAMA_REQUEST_TIMEOUT_MS`: optional completion timeout, defaulting to `120000`.
- `BRAVE_SEARCH_API_KEY`: required for Brave Search.
- `BRAVE_SEARCH_URL`: optional override for the Brave web search API, restricted to `api.search.brave.com`.
- `BRAVE_SEARCH_MAX_CALLS_PER_PROCESS`: optional process-level Brave Search call budget, defaulting to `50`.
- `HACKERNEWS_SEARCH_URL`: Hacker News Algolia API URL, restricted to `hn.algolia.com`.
- `ARXIV_QUERY_URL`: arXiv query API URL, restricted to `export.arxiv.org`.
- `LOG_LEVEL`: Pino log level, default `info`.
- `LOG_PRETTY`: set to `true` for pretty stderr logs.

JSON files configure domain behavior:

- Preferences are loaded by `src/memory/preferences.ts` and validated by `src/memory/schema.ts`.
- Source registry entries are loaded by `src/config/sourceRegistry.ts`.
- Pipeline configs are loaded by `src/framework/pipeline/config.ts`.

All config loaders parse JSON and validate with Zod before returning typed data.

## LLM Client and Structured Output Flow

Framework-level model contracts live in `src/framework/llm/types.ts`.

The reusable contract is `ModelClient`:

```ts
type ModelClient = {
  complete(messages: ChatMessage[], options?: ModelCompleteOptions): Promise<string>;
};
```

This keeps the harness independent of a specific model provider. The only real runtime adapter today is `llamaCppModelAdapter` in `src/llama/adapter.ts`; it delegates to the llama.cpp-compatible HTTP client in `src/llama/client.ts`.

The local model integration is in `src/llama/`.

`getLlamaConfig()` reads and validates environment variables. `complete()` builds an OpenAI-style chat completion request:

```json
{
  "model": "...",
  "messages": [{ "role": "system", "content": "..." }],
  "temperature": 0,
  "max_tokens": 1000,
  "response_format": { "type": "json_object" }
}
```

The client posts to `LLAMA_SERVER_URL` using shared HTTP timeout helpers, validates HTTP responses, parses JSON, validates the response shape with Zod, and returns the first choice message content. It logs start, finish, and failure events with trace IDs and labels when supplied.

Structured model calls use `src/framework/llm/repair.ts`.

`completeStructuredWithRepair()`:

1. Calls the model.
2. Parses the output as JSON using the shared JSON parser.
3. Validates the parsed value against a Zod schema.
4. If parsing or validation fails, appends the invalid assistant output and a repair prompt.
5. Calls the model once more with the same options and a `.repair` trace label.
6. Returns either a typed value or a structured `ModelParseError` payload.

This repair flow is used by daily scoring, daily classification, generic rubric scoring, and enterprise use-case extraction.

## Agent Harness

The reusable agent harness orchestrator lives in `src/framework/agent/harnessOrchestrator.ts`. It is dependency-injected with:

- a `ModelClient`
- a tool executor
- a prompt builder
- a tool prompt renderer
- a response parser
- optional logging and protocol labels

The Birbal-specific adapter lives in `src/agent/run.ts`.

The framework JSON protocol lives in `src/framework/agent/protocol.ts`. The base prompt in `prompts/system-agent.txt` tells the model to return exactly one JSON object using one of three response types:

- `{"type":"final","answer":"..."}`
- `{"type":"tool_call","tool":"...","args":{}}`
- `{"type":"clarify","question":"..."}`

`buildSystemPrompt()` appends rendered tool definitions from `src/tools/registry.ts`. `parseAgentResponse()` delegates to the framework parser and rejects responses that are too large, non-JSON, or invalid against the final/tool/clarify discriminated union.

The framework harness keeps a message history for up to the configured max steps. On a tool call it runs the injected tool executor, appends a `tool_result` user message, and continues. On `final` or `clarify`, it returns text to the caller. Invalid model JSON or protocol errors are returned as an agent error string instead of thrown.

The generic harness also exposes lifecycle hooks for framework users:

- `beforeModelCall`
- `afterModelCall`
- `onParseFailure`
- `onResponseParsed`
- `beforeToolCall`
- `afterToolCall`
- `onMaxSteps`

Framework consumers should import reusable APIs from `src/framework/index.ts` or the focused barrel modules under `src/framework/*/index.ts`.

## Agent Tools

Generic tool primitives live under `src/framework/tools/`. Birbal's concrete handwritten tools live under `src/tools/`. Each tool has:

- A stable name and description from `src/constants/tools.ts`.
- A Zod args schema.
- A Zod result schema.
- A `run()` implementation that receives parsed args and an optional abort signal.

Current tools:

- `get_time`: returns current local time as an ISO-like string.
- `search_arxiv`: searches arXiv through the arXiv client.
- `search_hackernews`: searches Hacker News stories through Algolia.
- `search_web`: searches Brave Search.
- `search_source_domain`: searches configured source domains through Brave Search.
- `fetch_url_text`: fetches a public URL and extracts readable text.

`src/framework/tools/registry.ts` owns the reusable `ToolRegistry`. `src/framework/tools/executor.ts` handles lookup, argument validation, timeout, result validation, structured logging, and error wrapping. `src/tools/registry.ts` and `src/tools/executor.ts` are thin Birbal adapters around those framework primitives.

## Pipeline Framework

The generic pipeline framework is in `src/framework/pipeline/`.

### Core Types

`types.ts` defines:

- `PipelineConfig`: the validated config contract for a pipeline run.
- `PipelineContext`: run-scoped state passed to all components.
- `PipelineResult`: run status, artifacts, counts, errors, and metadata.
- Component interfaces: `SourceCollector`, `ContentFetcher`, `ContentExtractor`, `Scorer`, `Classifier`, `StructuredExtractor`, `Selector`, `Renderer`, and `ArtifactWriter`.

The framework is intentionally generic. Pipeline components operate on `unknown` values and domain modules cast them back to their own types at boundaries.

### Config Loading

`config.ts` validates JSON pipeline files with Zod. It enforces:

- Required pipeline identity and enabled flag.
- Source IDs and collection methods.
- Content fetch policy.
- Optional scorer, rubric, classifier, and structured extractor IDs.
- Required selector and renderer IDs.
- Output settings.
- Numeric limits.
- Concurrency and batch sizes.
- Failure policy defaults.
- Optional schedule metadata with `cron` or `rrule`.

After validation, it builds a derived `components` object from configured component IDs so the registry can resolve everything consistently.

### Component Registry

`registry.ts` owns `PipelineComponentRegistry`.

The registry has separate buckets for collectors, fetchers, extractors, scorers, classifiers, structured extractors, selectors, renderers, artifact writers, and rubrics. Component IDs must be non-empty. Duplicate registration is rejected unless the registry is created with `allowOverwrite`.

`resolveFromConfig()` resolves all component IDs referenced by the pipeline config, including derived `components` entries. Unknown IDs fail the run before work begins.

`src/framework/pipeline/defaultComponents.ts` registers only generic framework components, currently the filesystem artifact writer. Birbal app components are registered from `src/pipelines/register.ts` using `registerBirbalPipelineComponents()`.

### Orchestration Stages

`orchestrator.ts` is the pipeline orchestration core. A run follows this order:

1. Load pipeline config.
2. Start a run record in SQLite.
3. Load the source registry.
4. Resolve configured components.
5. Build `PipelineContext`.
6. Run enabled collection methods with configured collection concurrency.
7. Dedupe collected items by normalized URL or item ID.
8. Apply `limits.maxCandidates`.
9. Optionally fetch content for the top `contentFetchPolicy.fetchForTopN` items.
10. Run configured content extractors for fetched content.
11. Prefer successfully fetched or paywalled items when `preferFetchedContent` is true.
12. Optionally score items, using batch scoring when the scorer and config support it.
13. Optionally classify items.
14. Optionally perform structured extraction.
15. Select final items.
16. Render output.
17. Write an artifact.
18. Finish the run and return a `PipelineResult`.

The orchestrator collects stage counts and structured errors. It supports fail-fast behavior and per-stage continuation controls through `failurePolicy`:

- `continueOnSourceFailure`
- `continueOnContentFetchFailure`
- `continueOnScoringFailure`
- `continueOnStructuredExtractionFailure`
- `minItemsRequiredForSuccess`
- `failFast`

Status is:

- `success` when an artifact was written, enough items were selected, and no errors occurred.
- `partial_success` when an artifact was written with enough selected items but errors occurred.
- `failed` when no artifact was written or the selected item count is below the configured minimum.

### Concurrency Helpers

`concurrency.ts` provides:

- `mapLimit()`: Promise mapping with `p-limit`.
- `chunkItems()`: positive-integer batch chunking.
- `mapBatches()`: batch mapping with configurable batch size and concurrency.

These helpers are used by collection, content fetch, scoring, classification, structured extraction, daily source collection, and use-case candidate collection.

### Run Persistence

`src/framework/pipeline/runStore.ts` defines the generic `PipelineRunStore` contract and an in-memory implementation for tests and framework examples. `src/db/pipelineRuns.ts` is Birbal's SQLite implementation; it starts, finishes, fails, and lists pipeline runs through the shared SQLite connection from `src/db/items.ts`.

Runs start as `failed` by default and are updated on completion. This makes interrupted runs visible as failed/incomplete records.

The framework-level `PipelineRunStore` interface captures the storage boundary. `sqlitePipelineRunStore` is the current implementation used by Birbal and is injected by the pipeline CLI.

## Birbal Pipeline Components

`src/pipelines/register.ts` adapts Birbal domain modules into framework components.

Registered Birbal collectors:

- `source_domain_collector`: collects configured daily sources for the `daily` pipeline.
- `brave_web_search_collector`: collects enterprise use-case candidates from configured Brave Search queries.

Registered Birbal content fetchers:

- `url_text_fetcher`: fetches URL text through `fetchUrlContent()`, reuses cached item content when present, and upserts fetched candidate text.

Registered Birbal scorers:

- `enterprise_deployment_scorer`: scores daily candidates with the enterprise daily rubric, persists items and scores, and supports batch scoring.

Registered Birbal classifiers:

- `enterprise_digest_classifier`: classifies daily scored items into digest categories; falls back deterministically if model classification fails.

Registered Birbal structured extractors:

- `enterprise_use_case_extractor`: extracts one or more current `EnterpriseUseCase` records from fetched article text.

Registered Birbal selectors:

- `daily_enterprise_mix_selector`: selects daily digest items using score thresholds, source limits, category slots, and trace output.
- `enterprise_use_case_selector`: selects high-confidence enterprise use cases with diversity constraints and persists them.

Registered Birbal renderers:

- `daily_markdown_renderer`: renders daily scored candidates to Markdown.
- `enterprise_use_case_markdown_renderer`: renders current enterprise use-case digest Markdown.

Registered artifact writers:

- `filesystem_artifact_writer`: writes rendered output inside the workspace only. It rejects absolute paths and `..` path traversal.

Registered rubrics:

- `enterprise_daily_reading_rubric`: the current daily scoring rubric.

## Daily Digest Pipeline

The current daily pipeline is configured in `config/pipelines/daily.json`.

Key config:

- `pipelineId`: `daily`.
- Sources: `hackernews`.
- Collector: `source_domain_collector`.
- Content fetcher: `url_text_fetcher`.
- Content fetch limit: top 10 items, max 12000 chars each.
- Scorer: `enterprise_deployment_scorer`.
- Rubric: `enterprise_daily_reading_rubric`.
- Classifier: `enterprise_digest_classifier`.
- Selector: `daily_enterprise_mix_selector`.
- Renderer: `daily_markdown_renderer`.
- Output: `digests/{date}.md`.
- Candidate limit: 20.
- Minimum successful selected items: 5.

The source registry currently enables Hacker News and disables arXiv. Preferences currently target advanced LLM-agent and AI-engineering topics, avoid generic AI news and similar low-value material, require a minimum final score for digest inclusion, limit items per source, and use a Hacker News-only daily mix.

Daily collection in `src/daily/pipeline.ts`:

- Lists enabled daily sources from the source registry.
- Applies academic fallback and daily source mix preferences.
- Uses dedicated Hacker News and arXiv collectors when available.
- Falls back to domain-constrained Brave Search for other configured domains.
- Runs sources concurrently.
- Stops querying a source after a rate-limit error.
- Dedupes by normalized URL.
- Ranks by publish date, source ID, and title.
- Applies source quotas from `dailyMix`.

Scoring in `src/daily/scoring.ts`:

- Builds a prompt containing user preferences, the enterprise rubric, candidate metadata, summary, and fetched content.
- Requests strict JSON with eight numeric criteria, rejection fields, and a short reason.
- Uses `completeStructuredWithRepair()` with `response_format: json_object`.
- Computes `finalScore` from rubric weights.
- Supports batch scoring with explicit candidate IDs and response cardinality validation.

Classification in `src/daily/classification.ts`:

- Hard-rejects rejected or zero-score items.
- Tries deterministic keyword hints first.
- Falls back to an LLM classification prompt when deterministic classification is ambiguous.
- Uses score-derived fallback if the model output cannot be repaired.

Selection in `src/daily/digestSelection.ts`:

- Filters rejected items, low-score items, and weak evergreen items.
- Targets digest slots for workflow redesign, agentic implementation, FDE/customer deployment, enterprise use cases, and backfill.
- Enforces `maxItemsPerSource`.
- Prefers higher scores, source diversity for close scores, fetched content, and practical depth.
- Produces a trace with source/category counts, selected items, and skipped constraints.

Rendering in `src/daily/digest.ts`:

- Writes a dated Markdown digest.
- Escapes Markdown-sensitive text.
- Includes source, link, publish date, category, score, five summary lines, workflow impact, why it matters, human role change, integrations, business metric, and positioning relevance.

## Enterprise Use-Case Pipeline

The current use-case pipeline is configured in `config/pipelines/use-cases.json`.

Key config:

- `pipelineId`: `use_cases`.
- Sources: OpenAI, Microsoft customer stories, Google Cloud customers, Anthropic, AWS case studies, consulting/business press.
- Collection method: `open_web_search` through `brave_web_search_collector`.
- Default Brave Search budget: five configured queries per run, enforced by `limits.maxSearchQueries`.
- Each query requests the maximum allowed Brave result count so quota discipline does not also reduce the per-call candidate pool.
- Content fetcher: `url_text_fetcher`.
- Content fetch limit: top 30 items, max 24000 chars each.
- Structured extractor: `enterprise_use_case_extractor`.
- Selector: `enterprise_use_case_selector`.
- Renderer: `enterprise_use_case_markdown_renderer`.
- Output: `digests/use-cases/{date}.md`.
- Limits include max candidates, search results per query, extraction candidates, result count, confidence threshold, and diversity caps by industry and source.

Candidate collection uses `src/pipelines/useCases/search.ts`:

- Uses the configured queries from `config/pipelines/use-cases.json`.
- Searches with Brave Search concurrently.
- Converts results with URL, title, description, published date, source name, and raw payload into `UseCaseSearchCandidate`.
- Drops candidates without URLs or published dates.
- Dedupes by normalized URL.
- Ranks by prioritized domain order, then recency, then title.
- Caps extraction candidates.

The active enterprise extractor is `src/pipelines/useCases/extractor.ts`.

It:

- Converts a daily-style `CandidateItem` plus fetched article text into a structured extraction prompt.
- Asks for a top-level `{ "useCases": [...] }` object.
- Requires every use case to include company, industry, business function, before/after workflow, AI capability, human role change, integrations, deployment stage, ROI metric, business outcome, governance/risk notes, implementation details, source fields, evidence summary, and `confidenceScore`.
- Allows `unknown` for unavailable source facts but tells the model not to invent evidence.
- Accepts multiple use cases per article.
- Normalizes common model shape mistakes such as arrays at the top level, `use_cases`, single objects, and `confidence`/`confidence_score`.
- Overwrites model-supplied `sourceUrl` with the trusted candidate URL before downstream selection, storage, or rendering.
- Throws `ModelParseError` if repair cannot produce valid output.

The active use-case schema is `src/pipelines/useCases/schema.ts`. It normalizes arrays and empty values into string fields, strips extra keys, normalizes confidence field aliases, and coerces string confidence values to numbers in the 1 to 5 range.

Selection in `src/pipelines/useCases/selector.ts`:

- Validates every use case through the schema.
- Filters below `minConfidenceScore`.
- Ranks by confidence score, then company/workflow label.
- Enforces caps for max use cases, max per industry, max per source, and duplicate similarity keys based on business function, workflow affected, and AI capability.

Rendering in `src/pipelines/useCases/renderer.ts`:

- Writes a dated enterprise AI use-case digest.
- Includes a summary table.
- Includes detailed sections for every selected use case.
- Escapes Markdown text and renders source links when URLs are valid HTTP(S).

Persistence in `src/db/useCases.ts`:

- Generates stable IDs from a SHA-256 hash of `sourceUrl`, `companyName`, and `workflowAffected`.
- Upserts into the `use_cases` table.
- Stores `runId`, normalized fields, confidence score, and raw JSON.
- Lists recent use cases or use cases by run.

## Data and Storage

SQLite persistence uses `better-sqlite3`.

`src/db/items.ts` owns the shared connection lifecycle:

- Default path: `data/agent.db`.
- `initDb()` creates the parent directory, opens the DB, enables foreign keys, sets WAL mode, creates schema, and runs lightweight migrations.
- The module tracks the active DB path. Reinitializing with the same path returns the current connection; a new path closes the old connection first.
- `closeDb()` closes and clears the singleton.

Tables:

- `items`: collected candidates by URL, source metadata, title, summary, publish/discovery time, optional content text, fetch status, category, and raw JSON.
- `scores`: one score row per item, including legacy score columns plus current enterprise rubric fields, rejection fields, reason, and final score.
- `runs`: pipeline run metadata, counts, status, artifact JSON, error summary, and additional metadata.
- `use_cases`: structured enterprise use cases with run ID, source metadata, evidence fields, confidence score, and raw JSON.

`src/db/items.ts` also provides:

- `getItemByUrl()`
- `upsertItem()`
- `listRecentItems()`
- `upsertScore()`
- `getScore()`
- `listTopScoredItems()`
- `listTopScoredItemsByIds()`

`src/db/pipelineRuns.ts` provides the Birbal SQLite run store:

- `startRun()`
- `finishRun()`
- `failRun()`
- `getRecentRuns()`
- `sqlitePipelineRunStore`

`src/framework/pipeline/runStore.ts` provides the storage interface, run status helpers, and `createInMemoryPipelineRunStore()`.

## HTTP, Network, and URL Safety

Outbound network helpers are deliberately defensive.

`src/framework/network/fetch.ts` provides:

- `fetchWithTimeout()`
- `fetchWithRetry()`
- structured timeout, abort, and retryable-status errors
- retry handling through `p-retry`

`src/http/client.ts` provides:

- bounded response body reading
- JSON parsing from responses
- HTTP status error construction
- bot-protection/body summarization for logs and pipeline errors

`src/http/url.ts` provides URL validation and SSRF-style protections:

- Only HTTP(S) URLs without credentials are allowed.
- Localhost, `.localhost`, `.local`, metadata hostnames, and non-public IPs are rejected.
- Hostnames are resolved and must resolve only to public addresses.
- API clients can restrict URLs to explicit allowed hosts.

`src/framework/content/fetchUrl.ts` implements safe article fetching:

- Validates URL and max character limits.
- Resolves and rejects unsafe hosts.
- Revalidates host DNS during the actual HTTP(S) connection using a safe per-request lookup.
- Follows redirects manually up to a limit, validating every redirect target.
- Sends a browser-like accept header and project user agent.
- Rejects unsupported content types.
- Reads bounded response text.
- Extracts readable text with Cheerio.
- Detects paywall-like content.
- Returns a structured `FetchUrlContentResult` instead of throwing for normal fetch failures.

`src/url-text/client.ts` wraps this for agent tools and older callers. It throws when the structured fetch status is `failed` and maps paywalls to `detectedPaywall`.

## Source Clients

### Brave Search

`src/brave-search/` reads `BRAVE_SEARCH_API_KEY` and an allowed-host search URL. `searchWeb()` calls Brave Search, requests web results only, does not automatically retry failed Brave requests, parses loosely with Zod, and normalizes title, URL, description, publish age/date, source name, and raw payload.

### Hacker News

`src/hackernews/` reads `HACKERNEWS_SEARCH_URL` from the environment and validates it against `hn.algolia.com`. `searchHackerNews()` queries Algolia story hits and normalizes them into title, URL, HN item URL, points, author, and creation timestamp.

### arXiv

`src/arxiv/` reads `ARXIV_QUERY_URL` from the environment and validates it against `export.arxiv.org`. `searchArxiv()` first tries a phrase query, then falls back to an all-terms query if the phrase query returns no results. It parses Atom XML with `fast-xml-parser`, normalizes authors and whitespace, and rate-limits requests through a small in-process queue.

### Source-Domain Search

`src/source-search/domain.ts` loads the source registry and searches each configured domain for a source using Brave Search `site:` queries. It filters returned URLs back to the configured domains, dedupes by normalized URL, and emits daily-style source-domain candidates.

## Rubrics and Scoring

Generic rubric support is in `src/framework/scoring/rubric.ts`.

A `Rubric` defines:

- `id`
- description
- scale
- criteria
- weights
- hard rejection rules
- output schema

`scoreItem()` builds a rubric prompt, asks the model for strict JSON, validates/repairs the response, and calculates `finalScore` with `calculateWeightedFinalScore()`. Rejected items get final score `0`.

The current daily rubric is `src/pipelines/daily/rubric.ts`. It scores:

- enterprise relevance
- workflow redesign depth
- real use-case specificity
- deployment/FDE relevance
- business outcome clarity
- technical implementation usefulness
- recency
- non-generic insight

Weights live in `src/constants/scoring.ts`.

## Logging and Tracing

Logging uses Pino through `src/logging/logger.ts`.

Default logs go to stderr. `LOG_LEVEL` controls severity. `LOG_PRETTY=true` enables `pino-pretty`.

The agent, tools, LLM client, structured repair flow, pipeline orchestrator, selectors, and source collection emit structured events with IDs such as:

- `agent.run.start`
- `handoff.harness_to_model`
- `llama.complete.started`
- `structured_output.validation_failed`
- `pipeline.run.started`
- `pipeline.stage.started`
- `pipeline.stage.failed`
- `pipeline.daily.selection`

`src/logging/preview.ts` truncates logged payload previews to avoid dumping large prompts, model outputs, or content bodies.

## JSON Utilities

`src/utils/json.ts` is used by strict structured-output callers. It is designed to parse model outputs that may contain JSON-like text and produce useful parse errors. Constants for JSON parsing behavior are grouped in `src/constants/json.ts`.

`src/utils/url.ts` normalizes URLs consistently for deduplication. Candidate collection, source-domain search, pipeline item dedupe, and use-case ranking all rely on normalized URLs to avoid duplicate work.

`src/utils/date.ts` provides date formatting helpers used by digest and report renderers.

## Testing Coverage

The test suite uses Node's built-in test runner through `tsx`.

Current test areas include:

- Agent response parsing and agent run behavior.
- Framework agent harness behavior with a fake model and fake tool.
- Tool registry and executor behavior.
- Llama request/response schemas.
- Shared LLM repair behavior.
- HTTP helpers and URL content fetching.
- Source registry and preferences validation.
- SQLite item, score, run, and use-case storage behavior.
- Pipeline config validation, component registry behavior, pipeline orchestration, and concurrency helpers.
- Daily collection, scoring, classification, digest writing, and digest selection.
- Generic rubric scoring.
- Production use-case scout behavior.
- Current enterprise use-case schema, extraction, selection, rendering, and storage.

Common quality commands:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run check
```

Some tests use dependency injection to avoid live network or live model calls. Runtime pipeline execution requires a reachable llama-compatible server for LLM stages and the relevant API env vars for external search.

## Adding or Changing a Pipeline

To add a config-driven pipeline:

1. Define or reuse domain types in a dedicated module.
2. Add collectors, fetchers, extractors, scorers, classifiers, selectors, renderers, and writers as small focused components.
3. Register generic component IDs with `registerFrameworkPipelineComponents()` and Birbal application component IDs with `registerBirbalPipelineComponents()`, or use a custom registry for tests.
4. Add a JSON config under `config/pipelines/`.
5. Validate limits, failure policy, and output path behavior.
6. Add focused tests for config validation, component resolution, orchestration behavior, and the new domain logic.

Pipeline output paths should stay relative to the workspace. The built-in filesystem writer rejects absolute paths and path traversal.

## How the Pieces Fit Together

For the daily pipeline:

1. CLI loads `config/pipelines/daily.json`.
2. Framework and Birbal components are registered.
3. Source registry and preferences are loaded.
4. `source_domain_collector` delegates to daily collection.
5. Items are deduped and content is fetched.
6. `enterprise_deployment_scorer` prompts the local LLM and stores scores.
7. `enterprise_digest_classifier` categorizes items.
8. `daily_enterprise_mix_selector` picks a balanced digest.
9. `daily_markdown_renderer` creates Markdown.
10. `filesystem_artifact_writer` writes `digests/{date}.md`.
11. The run is finalized in SQLite.

For the use-case pipeline:

1. CLI loads `config/pipelines/use-cases.json`.
2. Framework and Birbal components are registered.
3. Collection methods search source-specific and open-web queries.
4. Results are deduped, ranked, and content-fetched.
5. `enterprise_use_case_extractor` prompts the local LLM for structured use cases.
6. `enterprise_use_case_selector` filters and diversifies extracted records.
7. Selected records are upserted into SQLite.
8. `enterprise_use_case_markdown_renderer` creates Markdown.
9. `filesystem_artifact_writer` writes `digests/use-cases/{date}.md`.
10. The run is finalized in SQLite.

For the agent CLI:

1. CLI builds a system prompt from `prompts/system-agent.txt` plus registered tools.
2. The local LLM emits strict JSON.
3. The harness validates the response.
4. Tool calls are executed through the typed tool executor.
5. Tool results are appended as messages until the model returns `final`, asks to `clarify`, or hits the step limit.

## Current Design Boundaries

- Environment variables are the source of truth for runtime endpoints, models, API keys, and logging behavior.
- JSON files are the source of truth for pipeline, source, preference, and use-case query settings.
- Constants are grouped by domain under `src/constants/`.
- Database SQL lives in `src/constants/database.ts`; DB access functions live under `src/db/`.
- Prompt text for the agent base prompt lives in `prompts/`; task-specific LLM prompts are colocated with the domain modules that use them.
- Pipeline orchestration does not know domain shapes. Domain components adapt run items into concrete candidate or use-case types.
- The local LLM boundary is always schema-validated, with repair where structured output is required.
- Network fetches are bounded, retried where appropriate, and protected by URL/host safety checks.
