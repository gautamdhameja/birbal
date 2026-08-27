# Configuration

## Research preferences

`config/research.json` contains:

- `interests`
- `avoid`
- `preferredDifficulty`
- `maxReadingListItems`

## Curated sources

`config/source-registry.json` gives each source an ID, display name, domain list, source type, and
enabled flag. The source-domain tool accepts enabled source IDs and filters results back to
configured domains.

## Environment

`.env.local` takes precedence over `.env`. Environment variables configure:

- Model provider, endpoint, model, credential, and model request timeout.
- Research and source-registry file paths.
- arXiv, Hacker News, and Brave Search endpoints.
- Brave Search credentials and per-runtime call quota.
- Logging level and presentation.

See `.env.example` for the complete variable list. Set `RESEARCH_CONFIG_PATH` or
`SOURCE_REGISTRY_PATH` to load configuration from another location; otherwise Birbal uses its
bundled files.

`MODEL_REQUEST_TIMEOUT_MS` applies to model-provider requests only.
`BRAVE_SEARCH_MAX_CALLS_PER_PROCESS` retains its historical name for configuration compatibility,
but its quota applies independently to each newly created runtime's Brave Search client.

General network behavior is fixed in domain constants rather than environment variables. This
includes the default HTTP timeout, retry count and backoff, retryable status codes, response-size
limits, tool timeout, and URL-content redirect and character limits. Callers of reusable framework
fetch functions can override supported policy options programmatically; the default Birbal runtime
does not expose those options through the environment.

Environment files are loaded when the CLI runs, not when the CLI module is imported. `LOG_LEVEL`
and `LOG_PRETTY` remain the defaults for each newly created runtime. The CLI's `--trace` flag
applies debug and pretty logging only to that runtime; it does not rewrite either environment
variable or affect a later invocation in the same process.
