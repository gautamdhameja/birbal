# Testing

Run the full project check:

```sh
pnpm check
```

This runs:

1. Prettier check.
2. ESLint.
3. TypeScript typecheck.
4. Node test runner through `tsx`.

Run deterministic framework and app evals separately:

```sh
pnpm evals
birbal evals --suite agent_harness
birbal evals --suite use_case_extraction
```

These evals use scripted model responses, so they do not call a hosted model, local llama.cpp server, Brave Search, or external content sources.

## Useful Targeted Commands

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm evals
```

## What Tests Cover

The suite covers:

- Agent harness behavior.
- Tool validation and execution.
- JSON protocol parsing.
- llama request schema validation.
- Structured output repair.
- Pipeline config validation.
- Pipeline orchestration and failure policies.
- Pipeline component registry.
- Content fetching and URL safety.
- Daily scoring and selection.
- Use-case extraction, selection, rendering, and storage.
- SQLite persistence.

## Testing New Components

For a new tool, test:

- Valid args.
- Invalid args.
- Unknown or failed upstream behavior.
- Result shape.

For a new pipeline component, test:

- Component behavior in isolation.
- Registry resolution.
- Pipeline config validation.
- Orchestrator behavior if the component fails.
