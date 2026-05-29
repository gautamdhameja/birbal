# Quickstart

## Requirements

- Node.js compatible with the project lockfile.
- npm.
- A local llama.cpp-compatible chat completions server.
- A Brave Search API key if you want to run the research pipelines.

## Install

```sh
npm install
npm link
```

## Configure

Create `.env.local`:

```sh
LLAMA_SERVER_URL=http://127.0.0.1:8080/v1/chat/completions
LLAMA_MODEL=local
BRAVE_SEARCH_API_KEY=your_key_here
```

The llama server must expose an OpenAI-style chat completions endpoint. Birbal does not start llama.cpp for you.

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

The npm scripts remain available as repo-local wrappers around the same CLI.

For the full command reference, see [CLI](cli.md).

## Run Framework Examples

```sh
npm run example:agent
npm run example:pipeline
```

## Verify The Project

```sh
npm run check
```
