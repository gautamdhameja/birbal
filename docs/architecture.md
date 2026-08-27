# Architecture

```text
src/framework/
  agent/       reusable model-tool loop and protocol
  tools/       typed registry and executor
  llm/         model contracts and structured-output repair
  content/     readable-text extraction
  network/     safe HTTP, URL validation, retries, and timeouts
  async/       bounded async mapping
  config/      shared JSON config loading

src/app/
  agent/       Birbal prompt, parser, and harness composition
  tools/       research tool definitions
  research/    reading preferences and research result types
  config/      curated source registry
  arxiv/       arXiv client
  hackernews/  Hacker News client
  brave-search/ Brave Search client
  source-search/ configured-domain search
  model-providers/ provider selection and adapters
```

The framework never imports application modules. The app composes generic model, agent, and tool contracts with research-specific prompts and integrations.

At runtime, the harness sends the system prompt and task to the model. A tool call is validated and executed, its result is appended to message history, and the loop continues until a final answer or step limit.
