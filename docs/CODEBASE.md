# Codebase Map

Birbal is a stateless research agent built from a reusable TypeScript agent harness.

## Entry points

- `bin/birbal.js` launches the TypeScript CLI through the installed `tsx` runtime.
- `src/app/cli.ts` exposes the default research task and explicit `agent` command.
- `src/app/agent/run.ts` composes the model, tools, prompt, parser, and harness.

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

## Framework

- `src/framework/agent/` owns the model-tool loop and lifecycle hooks.
- `src/framework/tools/` owns typed registration and execution.
- `src/framework/llm/` owns provider-neutral types and structured repair.
- `src/framework/network/` owns safe HTTP behavior.
- `src/framework/content/` owns readable-text extraction.
- `src/framework/config/` owns reusable JSON config loading.

## Tests

`tests/` mirrors the retained runtime surfaces. The suite is deterministic by default and uses injected transports for network behavior.
