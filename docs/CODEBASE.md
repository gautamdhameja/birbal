# Codebase Map

Birbal combines two application workflows over a reusable TypeScript agent harness:

- The research agent investigates a task and returns a source-linked reading list.
- Architecture Case Lab researches a case, accepts a learner's design in an interactive session,
  challenges the design, and returns a sourced architecture review.

Each runtime owns its mutable integration state, including search quotas, arXiv request
scheduling, its tool registry, and its logger. Creating another runtime creates another isolated
state graph.

## Entry points and composition

- `bin/birbal.js` launches the TypeScript CLI through the installed `tsx` runtime.
- `src/app/cli.ts` loads environment configuration when invoked and routes the `agent` and `lab`
  commands.
- `src/app/runtime/default.ts` is the composition root. `createDefaultRuntime()` constructs the
  model, integrations, tools, logger, research agent, and lab operations. Its returned
  `createLabSession()` method binds those operations to a caller-provided input port and output
  callback.
- `src/app/runtime/types.ts` defines the runtime and lab-session factory contracts exposed to the
  CLI.

## Research workflow

- `src/app/agent/run.ts` binds already-constructed dependencies to the reusable harness.
- `src/app/agent/prompts.ts` and `src/app/agent/parse-response.ts` own the research prompt and
  response protocol.
- `src/app/tools/registry.ts` defines the operation-injected research tools and their registry.
- `src/app/research/` owns the research preferences types and loader.
- `config/research.json` stores reading preferences.
- `config/source-registry.json` stores curated research sources.

## Architecture Case Lab

- `src/app/architecture-lab/operations.ts` adapts the model and research harness into typed case
  preparation, opening-safety, challenge, evidence, and review operations.
- `src/app/architecture-lab/session.ts` owns the interactive state machine. It depends only on the
  typed operations and input port, and emits typed progress, case, challenge, and retry events.
- `src/app/architecture-lab/types.ts` defines evidence, operation, session, input, output, and
  result contracts.
- `src/app/architecture-lab/evidence.ts` validates source provenance and evidence requirements.
- `src/app/architecture-lab/prompts.ts`, `schemas.ts`, and `render.ts` keep prompting, validation,
  and presentation separate from orchestration.
- `src/app/terminal/readline.ts` is the Node readline adapter for the lab input port.
- `src/app/terminal/types.ts` defines adapter-specific input outcomes and lifecycle contracts.

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
- `src/framework/llm/` owns provider-neutral types and structured-output repair.
- `src/framework/network/` owns safe HTTP behavior.
- `src/framework/content/` owns readable-text extraction.
- `src/framework/config/` owns reusable JSON config loading.

The framework has no dependency on the research or Architecture Case Lab application modules.

## Tests

`tests/` mirrors the retained runtime surfaces. The suite is deterministic by default and uses
injected models, operations, terminal adapters, clocks, and transports at component boundaries.
