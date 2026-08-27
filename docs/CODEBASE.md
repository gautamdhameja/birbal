# Codebase Map

Birbal is a research agent built from a reusable TypeScript agent harness. Each runtime owns its
mutable integration state, including search quotas, arXiv request scheduling, its tool registry,
and its logger; creating another runtime creates another isolated state graph.

## Entry points

- `bin/birbal.js` launches the TypeScript CLI through the installed `tsx` runtime.
- `src/app/cli.ts` loads environment configuration when invoked, then passes CLI options to a
  runtime loader.
- `src/app/runtime/default.ts` is the composition root for the default model, integrations, tools,
  logger, and agent.
- `src/app/agent/run.ts` binds already-constructed dependencies to the reusable harness.

## Research configuration

- `config/research.json` stores reading preferences.
- `config/source-registry.json` stores curated research sources.
- `src/app/research/` owns the corresponding application types and loader.

## Integrations

- `src/app/arxiv/`
- `src/app/hackernews/`
- `src/app/brave-search/`
- `src/app/source-search/`
- `src/app/url-text/`
- `src/app/model-providers/`

Integration modules export factories rather than process-wide clients. Their I/O and state are
bound once in `src/app/runtime/default.ts`; tool definitions depend only on injected operation
contracts.

## Framework

- `src/framework/agent/` owns the model-tool loop and lifecycle hooks.
- `src/framework/tools/` owns typed registration and execution.
- `src/framework/llm/` owns provider-neutral types and structured repair.
- `src/framework/network/` owns safe HTTP behavior.
- `src/framework/content/` owns readable-text extraction.
- `src/framework/config/` owns reusable JSON config loading.

## Tests

`tests/` mirrors the retained runtime surfaces. The suite is deterministic by default and uses injected transports for network behavior.
