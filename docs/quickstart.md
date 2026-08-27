# Quickstart

## Requirements

- Node.js 22.13.0 or newer
- pnpm 10
- a llama.cpp-compatible server, or an OpenAI API key
- a Brave Search API key for web and configured-domain search

## Install and configure

```bash
pnpm install
cp .env.example .env.local
```

The default model provider is llama.cpp. To use OpenAI:

```dotenv
MODEL_PROVIDER=openai
MODEL_API_KEY=...
MODEL_NAME=...
```

Adjust `config/research.json` for reading preferences and `config/source-registry.json` for curated sources.

## Research a topic

```bash
pnpm cli -- "Research recent LLM agent evaluation techniques"
```

Birbal writes the source-linked reading list to standard output.

## Practice architecture design

Let Birbal select a recent case:

```bash
pnpm cli -- lab
```

Or name the case you want to study:

```bash
pnpm cli -- lab "AI customer-support triage"
```

Wait for each case or challenge prompt before entering your response. Submit a multiline response by entering `/submit` on its own line.

See [Architecture Case Lab](architecture-case-lab.md) for the complete workflow, controls, and limits.
