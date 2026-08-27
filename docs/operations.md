# Operations

Use `--trace` for structured model and tool handoff logs. Logs and interactive lab output go to stderr. Standard output contains either the research reading list or a completed architecture review, so you can capture the final artifact without mixing in diagnostics:

```bash
pnpm cli -- "Research agent evaluation" > reading-list.md
pnpm cli -- lab "AI customer-support triage" > review.txt
```

Common checks:

- confirm the selected model provider and endpoint;
- confirm `BRAVE_SEARCH_API_KEY` for web search;
- inspect tool errors for quota or timeout failures;
- reduce task breadth when the agent reaches its maximum step count;
- use `fetch_url_text` only for public HTML or plain-text pages.

Birbal has no durable persistence. A research command retains no application state after it returns. An Architecture Case Lab keeps its brief, draft, and transcript only for the current invocation; it cannot save or resume the session. Re-run a research task to refresh its sources, or start a new lab after an exit or failure.
