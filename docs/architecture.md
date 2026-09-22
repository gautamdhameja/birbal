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
  architecture-lab/ typed learning operations, session policy, and rendering
  runtime/     default application composition root
  terminal/    event-backed terminal input adapter
  tools/       research tool definitions
  research/    reading preferences and research result types
  config/      curated source registry
  arxiv/       arXiv client
  hackernews/  Hacker News client
  brave-search/ Brave Search client
  source-search/ configured-domain search
  url-text/    URL-fetch contracts, result schema, and application client
  model-providers/ provider selection, configuration, and shared client
```

The framework never imports application modules. Application policy and tool definitions depend on
narrow contracts, not concrete vendor clients. `src/app/runtime/default.ts` is the one place that
constructs the default graph: it creates fresh integration clients, injects their operations into
tools, registers those tools, selects the configured model client, creates a logger, and binds the
agent.

Runtime creation is the lifecycle boundary. Brave quota/circuit state, arXiv scheduling state, the
tool registry, and logging configuration are isolated per runtime. Configuration loaders and clocks
can be replaced at client construction without changing domain logic. The configured-source domain
uses a neutral web-search port, so Brave is an adapter choice rather than a domain dependency.

At runtime, the harness sends the system prompt and task to the model. A tool call is validated and executed, its result is appended to message history, and the loop continues until a final answer or step limit.

## Architecture Case Lab boundaries

The lab is an application workflow rather than a feature of the generic harness. `architecture-lab/operations.ts` composes the existing model, tool runner, and research harness behind typed operations for case preparation, opening safety, challenges, evidence collection, and review. It uses a lab-specific research prompt and structured results; it does not call the configured reading-list agent or parse its Markdown output.

`architecture-lab/session.ts` owns the learning state machine, draft and transcript bounds, commands, and three-round cap. It depends only on injected operations, an input port, and an output callback. It does not import Node terminal APIs, runtime composition, provider selection, tool registries, or vendor clients. `architecture-lab/render.ts` converts typed values into plain text without deciding output channels.

`terminal/readline.ts` adapts Node line, EOF, Ctrl-C, and input-error events to the host-neutral input port. `cli.ts` owns stdout, stderr, exit statuses, and adapter cleanup. `runtime/default.ts` is the only concrete composition root: it shares generic model and research capabilities, creates a separate lab operation adapter, and returns a fresh session for every lab invocation.

This separation keeps the existing reading-list workflow unchanged and independently invocable. It also makes the controller, terminal adapter, and model-backed operations testable without importing one another's concrete infrastructure. See [Architecture Case Lab](architecture-case-lab.md) for the user-facing flow.
