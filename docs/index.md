# Birbal

Birbal is a local TypeScript agent harness framework with a working enterprise AI research scout built on top of it. The framework exists to make the mechanics of an agent harness explicit: model adapters, strict JSON protocol parsing, tool registration, tool execution, structured output repair, pipeline orchestration, component registries, run metadata, and artifact writing.

The first app built with the framework is an enterprise AI research scout. It can collect web candidates, fetch page text, ask a local model to extract real enterprise AI use cases, select the strongest results, persist run metadata, and write Markdown digests.

Birbal currently supports one real model adapter: llama.cpp through an OpenAI-compatible local chat completions endpoint. The framework is intentionally adapter-based, but no other production model provider is shipped yet.

## What This Project Includes

- A JSON-protocol agent harness for model and tool loops.
- A typed handwritten tool system with Zod validation.
- A configurable pipeline framework for deterministic research workflows.
- Shared network, content fetching, structured output repair, and scoring utilities.
- A concrete enterprise AI scout app that proves the framework against a real task.

## Documentation Map

Start with [Quickstart](quickstart.md) and [CLI](cli.md) if you want to run Birbal locally. Read [Architecture](architecture.md) and [Agent Harness](agent-harness.md) if you want to understand the framework. Read [Pipeline Framework](pipelines.md) and [Extension Guide](extension-guide.md) if you want to build your own pipeline or app on top of it.
