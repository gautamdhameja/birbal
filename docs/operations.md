# Operations

Use `--trace` for structured model and tool handoff logs. Logs go to stderr so stdout remains suitable for capturing the reading list.

Common checks:

- confirm the selected model provider and endpoint;
- confirm `BRAVE_SEARCH_API_KEY` for web search;
- inspect tool errors for quota or timeout failures;
- reduce task breadth when the agent reaches its maximum step count;
- use `fetch_url_text` only for public HTML or plain-text pages.

Birbal is stateless. Re-run a task to refresh its research.
