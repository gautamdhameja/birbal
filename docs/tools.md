# Tools

Birbal registers six typed tools:

- `get_time`
- `search_arxiv`
- `search_hackernews`
- `search_web`
- `search_source_domain`
- `fetch_url_text`

Every tool has Zod argument and result schemas. `ToolRegistry` exposes `register`, `registerMany`, `list`, `renderForPrompt`, and `get`. `createToolExecutor` validates calls, enforces a timeout, validates results, and converts failures into structured error objects.

Add a tool by defining its schemas and `run` function, then registering it in `src/app/tools/registry.ts`.
