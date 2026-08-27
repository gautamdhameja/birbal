# API Reference

The main framework export is `src/framework/index.ts`.

Agent exports include `createAgentHarness`, protocol schemas, lifecycle hooks, and response types. Tool exports include `ToolRegistry`, `createToolExecutor`, tool contracts, and trace types. LLM exports include `ModelClient`, message and completion types, strict JSON parsing, and structured-output repair. Content and network modules expose safe URL fetching, readable-text extraction, retries, timeouts, and URL normalization.

The Birbal application composes these APIs in `src/app/agent/run.ts` and `src/app/tools/registry.ts`.
