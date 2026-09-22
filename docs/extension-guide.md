# Extension Guide

## Add a research tool

1. Create a focused tool module under `src/app/tools/`.
2. Define strict Zod argument and result schemas.
3. Export an operation-injected tool factory and honor the abort signal in `run(args, context)`.
4. Add the operation contract to `src/app/tools/types.ts` when it is shared across modules.
5. Include the factory in `createResearchTools` in `src/app/tools/registry.ts`.
6. Bind its concrete integration operation only in `src/app/runtime/default.ts`.
7. Add schema, happy-path, and failure-path coverage to `tests/tools.test.ts`.

## Add a model provider

For an OpenAI-compatible endpoint, add a focused provider configuration module and register it with
the shared client in `src/app/model-providers/default.ts`. Implement a separate `ModelClient` only
when the provider uses a different protocol. Validate environment input at the boundary.

Framework modules must remain application-independent.
