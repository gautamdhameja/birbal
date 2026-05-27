# Testing

Run the full project check:

```sh
npm run check
```

This runs:

1. Prettier check.
2. ESLint.
3. TypeScript typecheck.
4. Node test runner through `tsx`.

## Useful Targeted Commands

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
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
