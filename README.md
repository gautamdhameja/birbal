# Birbal

Birbal is a local TypeScript agent harness framework with a working enterprise AI research scout built on top of it. The framework provides reusable primitives for model adapters, strict JSON agent protocols, handwritten tools, tool execution, structured output repair, config-driven pipelines, component registries, run metadata, content fetching, scoring, selection, and artifact writing.

The Birbal app currently ships one real model adapter: `llamaCppModelAdapter`, which targets a local llama.cpp-compatible chat completions server. The app workflows are a daily enterprise AI reading digest and an enterprise AI use-case scout. Runtime configuration comes from environment variables and JSON config files, and schemas are validated with Zod at the boundaries.

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
| llama.cpp today      |                              |
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
npm install
npm run dev -- "Use a tool to get the current time and tell me what it is."
npm run daily
npm run use-cases
npm run example:agent
npm run example:pipeline
npm run check
```

Use `--trace` with the agent or pipeline commands for debug logs:

```sh
npm run dev -- --trace "Use a tool to get the current time."
npm run run-pipeline -- use_cases --trace
```

## Configuration

Create `.env.local` for local runtime settings:

```sh
LLAMA_SERVER_URL=http://localhost:8080/v1/chat/completions
LLAMA_MODEL=local-model
BRAVE_SEARCH_API_KEY=...
```

The important JSON config files are:

- `config/preferences.json`: research preferences and thresholds.
- `config/source-registry.json`: searchable sources, domains, priorities, and queries.
- `config/pipelines/daily.json`: daily digest pipeline.
- `config/pipelines/use-cases.json`: enterprise use-case scout pipeline.

## Project Layout

- `src/framework/`: reusable harness, tools, LLM, pipeline, content, network, and scoring modules.
- `src/llama/`: llama.cpp-compatible model client and framework adapter.
- `src/tools/`: Birbal's handwritten agent tools.
- `src/pipelines/`: Birbal pipeline component registration and use-case/daily modules.
- `src/db/`: SQLite persistence for items, scores, runs, and extracted use cases.
- `examples/`: small framework examples that do not depend on the enterprise research app.
- `docs/CODEBASE.md`: extended codebase documentation.

Generated runtime data lives in `data/` and `digests/` and is ignored by Git.

## Documentation

The publishable documentation lives in `docs/`. It includes an mdBook-compatible `SUMMARY.md` and `book.toml`, plus pages covering quickstart, architecture, the agent harness, tools, model adapters, pipelines, configuration, security, operations, and framework extension.
