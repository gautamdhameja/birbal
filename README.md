# Birbal

Birbal is a local TypeScript research agent and architecture learning lab. Give the research agent a topic to get a concise, source-linked reading list, or use the interactive lab to practice designing an impactful AI system and receive a sourced review.

The agent uses llama.cpp by default and can use hosted OpenAI through the same model interface. Runtime preferences and curated sources are JSON configuration; provider and network settings come from environment variables.

## Install

```bash
pnpm install
cp .env.example .env.local
```

For local inference, run a llama.cpp-compatible chat-completions server. For hosted OpenAI, set `MODEL_PROVIDER=openai`, `MODEL_API_KEY`, and `MODEL_NAME`.

## Research

```bash
pnpm dev -- "Research recent approaches to evaluating LLM agents"
pnpm cli -- "Compare current local inference engines"
pnpm cli -- agent "Find primary sources on retrieval evaluation"
```

Use `--trace` to print tool definitions and structured handoff logs:

```bash
pnpm cli -- --trace "Research agent memory architectures"
```

The answer is printed to stdout. Birbal does not persist results or publish files.

## Architecture Case Lab

Start with an automatically selected case or name one:

```bash
pnpm cli -- lab
pnpm cli -- lab "AI customer-support triage"
```

The lab presents sourced problem context without a solution. Enter a multiline architecture draft, then enter `/submit` on its own line. Answer up to three focused challenges the same way, use `/finish` for an early review, or `/exit` to leave without a review.

Progress, the case brief, challenges, and retry messages go to stderr. Only a completed review goes to stdout, so it can be redirected or piped separately. Lab state lasts for one invocation and is never saved.

See [Architecture Case Lab](docs/architecture-case-lab.md) for controls, limits, evidence labels, and interruption behavior.

## Configuration

- `config/research.json` controls interests, avoided topics, preferred difficulty, and the maximum reading-list size.
- `config/source-registry.json` defines curated source IDs and domains.
- `.env.local` and `.env` configure the model provider, Brave Search, logging, and network limits.

Set `RESEARCH_CONFIG_PATH` or `SOURCE_REGISTRY_PATH` to use configuration files outside the package.

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
