# Extension Guide

## Add a research tool

1. Create a focused tool module under `src/app/tools/`.
2. Define strict Zod argument and result schemas.
3. Implement `run(args, context)` and honor the abort signal.
4. Register the tool in `src/app/tools/registry.ts`.
5. Add schema, happy-path, and failure-path coverage to `tests/tools.test.ts`.

## Add a model provider

Implement `ModelClient`, put provider configuration in its own module, validate environment input at the boundary, and register selection in `src/app/model-providers/default.ts`.

Framework modules must remain application-independent.
