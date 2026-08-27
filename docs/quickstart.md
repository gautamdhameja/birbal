# Quickstart

## Requirements

- Node.js 20.18.1 or newer
- pnpm 10
- a llama.cpp-compatible server, or an OpenAI API key
- a Brave Search API key for web and configured-domain search

## Run

```bash
pnpm install
cp .env.example .env.local
pnpm dev -- "Research recent LLM agent evaluation techniques"
```

The default model provider is llama.cpp. To use OpenAI:

```dotenv
MODEL_PROVIDER=openai
MODEL_API_KEY=...
MODEL_NAME=...
```

Adjust `config/research.json` for reading preferences and `config/source-registry.json` for curated sources.
