# Birbal

Birbal is a local TypeScript agent harness framework with a working enterprise AI research scout built on top of it. The framework provides reusable primitives for model adapters, strict JSON agent protocols, handwritten tools, tool execution, structured output repair, config-driven pipelines, component registries, run metadata, content fetching, scoring, selection, and artifact writing.

The Birbal app ships provider-neutral model wiring with llama.cpp as the default local adapter and hosted OpenAI as an optional adapter. The app workflows are a daily enterprise AI reading digest and an enterprise AI use-case scout. Runtime configuration comes from environment variables and JSON config files, and schemas are validated with Zod at the boundaries.

## Harness Flow

```text
User task
   |
   v
+----------------------+
| Agent Harness        |
| - build system prompt|
| - render tools       |
| - keep message state |
+----------+-----------+
           |
           | prompt + context + tool descriptions
           v
+----------------------+        JSON final answer
| Model Adapter        |------------------------------+
| llama.cpp / OpenAI   |                              |
+----------+-----------+                              |
           |                                          |
           | JSON tool_call                           |
           v                                          |
+----------------------+                              |
| Tool Executor        |                              |
| - lookup tool        |                              |
| - validate args      |                              |
| - run tool           |                              |
| - wrap errors        |                              |
+----------+-----------+                              |
           |                                          |
           | JSON tool_result                         |
           v                                          |
+----------------------+                              |
| Agent Harness        |<-----------------------------+
| append result and    |
| continue or finish   |
+----------------------+
```

The model never calls tools directly. It emits a strict JSON object, the harness parses and validates it, and the tool executor handles the actual function call. Tool results are appended back into the conversation as JSON so the next model pass can decide whether to call another tool, ask for clarification, or return a final answer.

## Pipeline Flow

```text
Pipeline config
   |
   v
+-------------------------+
| Pipeline Orchestrator   |
+-----------+-------------+
            |
            v
 Collect candidates -> Fetch content -> Score / Extract -> Select -> Render -> Write artifact
            |               |              |              |         |         |
            v               v              v              v         v         v
       source registry   fetch policy   rubrics/LLM   selectors  renderers  digests/
```

Pipeline behavior is data-driven by `config/pipelines/*.json`. Generic framework code lives under `src/framework/`; Birbal-specific collectors, scorers, extractors, selectors, and renderers are registered from `src/pipelines/register.ts`.

## Main Commands

```sh
pnpm install
pnpm link --global
birbal agent "Use a tool to get the current time and tell me what it is."
birbal daily
birbal use-cases
birbal use cases
pnpm example:agent
pnpm example:pipeline
pnpm check
```

The pnpm scripts still work for repo-local development:

```sh
pnpm dev -- "Use a tool to get the current time and tell me what it is."
pnpm daily
pnpm use-cases
```

See [docs/cli.md](docs/cli.md) for the complete command reference.

Use `--trace` with the agent or pipeline commands for debug logs:

```sh
birbal agent --trace "Use a tool to get the current time."
birbal pipeline use_cases --trace
```

## Configuration

Create `.env.local` for local runtime settings:

```sh
MODEL_PROVIDER=llama_cpp
MODEL_BASE_URL=http://localhost:8080
MODEL_NAME=local-model
BRAVE_SEARCH_API_KEY=...
```

To use the hosted OpenAI API instead of llama.cpp:

```sh
MODEL_PROVIDER=openai
MODEL_API_KEY=...
MODEL_NAME=gpt-...
```

The important JSON config files are:

- `config/preferences.json`: research preferences and thresholds.
- `config/source-registry.json`: searchable sources, domains, priorities, and queries.
- `config/pipelines/daily.json`: daily digest pipeline.
- `config/pipelines/use-cases.json`: enterprise use-case scout pipeline.

## Project Layout

- `src/framework/`: reusable harness, tools, LLM, pipeline, content, network, and scoring modules.
- `src/model-providers/`: provider selection plus OpenAI-compatible model adapters.
- `src/llama/`: llama.cpp-compatible model adapter.
- `src/tools/`: Birbal's handwritten agent tools.
- `src/pipelines/`: Birbal pipeline component registration and use-case/daily modules.
- `src/db/`: SQLite persistence for items, scores, runs, and extracted use cases.
- `examples/`: small framework examples that do not depend on the enterprise research app.
- `docs/CODEBASE.md`: extended codebase documentation.

Generated runtime data lives in `data/` and `digests/` and is ignored by Git.

For prompt iteration on the use-case scout, search can be separated from model processing:

```sh
birbal use-cases search
birbal use-cases process --snapshot latest
```

The search command stores a reusable URL snapshot in SQLite. The process command reuses that snapshot for fetch, extraction, verification, selection, and rendering without spending additional Brave Search calls.

The full `birbal use-cases` command uses bounded adaptive search. It searches one configured query batch, processes the accumulated snapshot, and if the final selection is short of the requested report size it can search additional batches up to the configured retry limit.

## Documentation

The publishable documentation lives in `docs/`. It includes an mdBook-compatible `SUMMARY.md` and `book.toml`, plus pages covering quickstart, architecture, the agent harness, tools, model adapters, pipelines, configuration, security, operations, and framework extension.
