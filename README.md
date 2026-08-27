# Birbal

Birbal is a local TypeScript research agent. Give it a topic and it uses explicit search and page-fetch tools to return a concise, source-linked reading list.

The agent uses llama.cpp by default and can use hosted OpenAI through the same model interface. Runtime preferences and curated sources are JSON configuration; provider and network settings come from environment variables.

## Install

```bash
pnpm install
cp .env.example .env.local
```

For local inference, run a llama.cpp-compatible chat-completions server. For hosted OpenAI, set `MODEL_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL`.

## Research

```bash
pnpm dev -- "Research recent approaches to evaluating LLM agents"
birbal "Compare current local inference engines"
birbal agent "Find primary sources on retrieval evaluation"
```

Use `--trace` to print tool definitions and structured handoff logs:

```bash
birbal --trace "Research agent memory architectures"
```

The answer is printed to stdout. Birbal does not persist results or publish files.

## Configuration

- `config/research.json` controls interests, avoided topics, preferred difficulty, and the maximum reading-list size.
- `config/source-registry.json` defines curated source IDs, domains, and suggested queries.
- `.env.local` and `.env` configure the model provider, Brave Search, logging, and network limits.

## Tools

The agent can:

- search arXiv;
- search Hacker News;
- search the web through Brave Search;
- restrict Brave Search to a configured source;
- fetch and extract readable text from a public URL;
- inspect local time.

All tool inputs and outputs are validated with Zod. Public URL fetching rejects private and unsafe network targets, revalidates DNS at connection time, bounds response size, and enforces abort and timeout behavior.

## Development

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

See [docs/index.md](docs/index.md) for the documentation map.
