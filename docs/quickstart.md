# Quickstart

## Requirements

- Node.js compatible with the project lockfile.
- pnpm.
- A local llama.cpp-compatible chat completions server, or an OpenAI API key.
- A Brave Search API key if you want to run the research pipelines.

## Install

```sh
pnpm install
pnpm link --global
```

## Configure

Create `.env.local`:

```sh
MODEL_PROVIDER=llama_cpp
MODEL_BASE_URL=http://127.0.0.1:8080
MODEL_NAME=local
BRAVE_SEARCH_API_KEY=your_key_here
```

The llama server must expose an OpenAI-style chat completions endpoint. Birbal does not start llama.cpp for you.

To use hosted OpenAI instead:

```sh
MODEL_PROVIDER=openai
MODEL_API_KEY=your_key_here
MODEL_NAME=gpt-...
BRAVE_SEARCH_API_KEY=your_key_here
```

## Run The Agent Harness

```sh
birbal agent "Use a tool to get the current time and tell me what it is."
```

With trace logs:

```sh
birbal agent --trace "Use a tool to get the current time."
```

## Run The Pipeline App

```sh
birbal daily
birbal use-cases
```

Dry-run a pipeline config without making network or model calls:

```sh
birbal pipeline use_cases --dry-run
```

The pnpm scripts remain available as repo-local wrappers around the same CLI.

For the full command reference, see [CLI](cli.md).

## Run Framework Examples

```sh
pnpm example:agent
pnpm example:pipeline
```

## Verify The Project

```sh
pnpm check
pnpm evals
```
