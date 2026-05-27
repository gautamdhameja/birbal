# Quickstart

## Requirements

- Node.js compatible with the project lockfile.
- npm.
- A local llama.cpp-compatible chat completions server.
- A Brave Search API key if you want to run the research pipelines.

## Install

```sh
npm install
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
npm run dev -- "Use a tool to get the current time and tell me what it is."
```

With trace logs:

```sh
npm run dev -- --trace "Use a tool to get the current time."
```

## Run The Pipeline App

```sh
npm run daily
npm run use-cases
```

Dry-run a pipeline config without making network or model calls:

```sh
npm run run-pipeline -- use_cases --dry-run
```

## Run Framework Examples

```sh
npm run example:agent
npm run example:pipeline
```

## Verify The Project

```sh
npm run check
```
