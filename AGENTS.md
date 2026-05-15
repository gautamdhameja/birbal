# Agent Instructions

## Engineering Rules

- Keep a clear separation of concerns. Put types, configuration, runtime client logic, prompts, data, digests, and orchestration in distinct files or folders.
- Follow DRY strictly. Do not duplicate constants, endpoint/model configuration, type definitions, response-shape definitions, or reusable logic.
- Environment variables are the source of truth for runtime configuration. Do not repeat configured values in client code.
- Prefer small, focused modules with explicit imports over large files that mix responsibilities.
- Use TypeScript types from dedicated type files when the shapes are shared or part of an integration contract.
