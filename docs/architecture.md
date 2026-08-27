# Architecture

```text
src/framework/
  agent/       reusable model-tool loop and protocol
  tools/       typed registry and executor
  llm/         model contracts and structured-output repair
  content/     readable-text extraction
  network/     safe HTTP, URL validation, retries, and timeouts
  config/      shared JSON config loading

src/app/
  agent/       Birbal prompt, parser, and harness composition
  runtime/     default application composition root
  tools/       research tool definitions
  research/    reading preferences and research result types
  config/      curated source registry
  arxiv/       arXiv client
  hackernews/  Hacker News client
  brave-search/ Brave Search client
  source-search/ configured-domain search
  model-providers/ provider selection and adapters
```

The framework never imports application modules. Application policy and tool definitions depend on
narrow contracts, not concrete vendor clients. `src/app/runtime/default.ts` is the one place that
constructs the default graph: it creates fresh integration clients, injects their operations into
tools, registers those tools, selects a model adapter, creates a logger, and binds the agent.

Runtime creation is the lifecycle boundary. Brave quota/circuit state, arXiv scheduling state, the
tool registry, and logging configuration are isolated per runtime. Configuration loaders and clocks
can be replaced at client construction without changing domain logic. The configured-source domain
uses a neutral web-search port, so Brave is an adapter choice rather than a domain dependency.

At runtime, the harness sends the system prompt and task to the model. A tool call is validated and executed, its result is appended to message history, and the loop continues until a final answer or step limit.
