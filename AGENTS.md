# Agent Instructions

## Engineering Rules

- Keep a clear separation of concerns. Put types, configuration, runtime client logic, prompts, data, digests, and orchestration in distinct files or folders.
- Follow DRY strictly. Do not duplicate constants, endpoint/model configuration, type definitions, response-shape definitions, or reusable logic.
- Environment variables are the source of truth for runtime configuration. Do not repeat configured values in client code.
- Prefer small, focused modules with explicit imports over large files that mix responsibilities.
- Use TypeScript types from dedicated type files when the shapes are shared or part of an integration contract.
- Balance DRY with separation of concerns. Do not fix duplicated constants by creating a large catch-all constants file. Constants should be grouped by domain or responsibility, with a barrel export only if it preserves a clean import surface.
- Do not move incidental language syntax or tiny local parsing tokens into global constants unless they are part of a shared contract or reused behavior. Over-centralization is still a design smell.
- When adding stateful singletons, caches, queues, or database connections, review lifecycle behavior explicitly. Tests should cover reinitialization, path/config changes, and repeated calls, not only the first successful use.
- Keep dependency classification clean. Runtime packages belong in `dependencies`; type packages, test tools, and build-only packages belong in `devDependencies`.
- During cleanup, look for both duplication and unnecessary abstraction. Removing duplication should not make modules broader, less cohesive, or harder to reason about.
