# Birbal

Birbal is a local TypeScript agent harness for research and artificial intelligence (AI) architecture learning. Use it to generate a source-linked reading list or practice designing an AI system in an interactive Architecture Case Lab.

The project demonstrates the main components of an agent harness: model adapters, structured model output, validated tools, a bounded model-tool loop, application-level orchestration, and host-neutral input and output ports.

## Choose a workflow

- **Research a topic:** Birbal investigates a question and returns a concise reading list with source links, reasons to read, and key takeaways.
- **Practice architecture design:** Birbal researches a case, hides the reference architecture until you submit a proposal, challenges your design, and returns a sourced qualitative review.

Birbal does not save sessions, publish files, or maintain a learner profile.

## Requirements

Before you run Birbal, install or configure the following software and services:

- Node.js 20.18.1 or later.
- pnpm 10.
- A llama.cpp-compatible chat-completions server or an OpenAI API key.
- A Brave Search API key for general web and configured-domain searches.

## Install Birbal

1. Install the dependencies:

   ```bash
   pnpm install
   ```

2. Create a local environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Configure one model provider in `.env.local`.

## Configure a model provider

### Use llama.cpp

The default configuration connects to a llama.cpp-compatible server at `http://127.0.0.1:8080`.

1. Start a server that implements the OpenAI-compatible chat-completions endpoint.
2. Keep these values in `.env.local`, or replace them with your server details:

   ```dotenv
   MODEL_PROVIDER=llama_cpp
   MODEL_BASE_URL=http://127.0.0.1:8080
   MODEL_NAME=local
   ```

### Use OpenAI

Set the following values in `.env.local`:

```dotenv
MODEL_PROVIDER=openai
MODEL_API_KEY=your-api-key
MODEL_NAME=your-model-name
```

Birbal uses `https://api.openai.com` as the default OpenAI base URL. Set `MODEL_BASE_URL` only when you need a different endpoint.

### Enable web search

Add your Brave Search API key to `.env.local`:

```dotenv
BRAVE_SEARCH_API_KEY=your-api-key
```

The arXiv and Hacker News tools don't require this key. The `search_web` and configured-domain search tools do require it.

## Research a topic

Run the default research workflow with a question or topic:

```bash
pnpm cli -- "Research recent approaches to evaluating AI agents"
```

You can also name the `agent` command explicitly:

```bash
pnpm cli -- agent "Compare current local inference engines"
```

If you omit the topic, Birbal uses its configured default research task:

```bash
pnpm cli
```

Birbal writes the final reading list to standard output. It writes logs and trace information to standard error.

To inspect tool definitions and structured handoffs, add `--trace`:

```bash
pnpm cli -- --trace agent "Research agent memory architectures"
```

## Practice an architecture case

Start the Architecture Case Lab and let Birbal select a recent, evidence-backed case:

```bash
pnpm cli -- lab
```

To study a specific use case, add its name:

```bash
pnpm cli -- lab "AI customer-support triage"
```

Complete the lab as follows:

1. Read the problem, affected actors, constraints, desired outcome, sources, and evidence status.
2. Enter your architecture proposal. You can use multiple lines.
3. Enter `/submit` on its own line.
4. Answer each architecture challenge, then enter `/submit` again.
5. Review the final assessment after the third answered challenge.

The lab recognizes these whole-line commands:

- `/submit` commits the current multiline draft.
- `/finish` requests the best available review after you submit a proposal.
- `/exit` ends the session without a review.
- Ctrl-D ends input without a review unless a requested final review is already running.
- Ctrl-C requests interruption and returns exit status 130.

Birbal writes the case, progress, challenges, and retry guidance to standard error. It writes only the completed architecture review to standard output. Redirect the review without mixing it with interactive content:

```bash
pnpm cli -- lab "AI customer-support triage" > review.txt
```

For the complete learning flow, evidence rules, limits, and interruption behavior, see [Architecture Case Lab](docs/architecture-case-lab.md).

## Understand the architecture

Birbal separates reusable harness infrastructure from application workflows:

- `src/framework/agent/` owns the bounded model-tool loop and the `tool_call` or `final` protocol.
- `src/framework/tools/` owns typed tool registration, input validation, and execution.
- `src/app/agent/` composes the research and reading-list workflow.
- `src/app/architecture-lab/` owns typed lab operations, evidence validation, the learning session, and rendering.
- `src/app/terminal/` adapts Node terminal events to a host-neutral input contract.
- `src/app/runtime/default.ts` connects concrete providers and clients at the application composition root.

The framework never imports application modules. The session controller does not import terminal or provider implementations. These boundaries keep each component replaceable and independently testable.

For the dependency map and lifecycle details, see [Architecture](docs/architecture.md) and [Agent harness](docs/agent-harness.md).

## Review the safety boundaries

Birbal applies the following bounds and validation rules:

- Zod validates all tool inputs, tool outputs, and structured model results.
- Public URL fetching rejects private or unsafe network targets and revalidates DNS before connecting.
- Network requests have retry, timeout, and response-size limits.
- Research runs, challenge rounds, individual drafts, transcripts, and queued terminal input are bounded.
- The lab checks case openings for solution leakage before it displays them.
- Research citations must originate from successful tool results.
- Terminal rendering removes control characters that could alter terminal output.

These checks reduce risk, but model-generated research still requires human judgment. Review cited sources before you rely on a result.

## Configure research behavior

Use the following files and environment variables to change runtime behavior:

| Location                      | Purpose                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `config/research.json`        | Defines interests, avoided topics, preferred difficulty, and the maximum reading-list size.   |
| `config/source-registry.json` | Defines curated source identifiers, display names, domains, source types, and enabled status. |
| `.env.local` and `.env`       | Configure model providers, API keys, endpoints, timeouts, logging, and search limits.         |
| `RESEARCH_CONFIG_PATH`        | Loads research preferences from another file.                                                 |
| `SOURCE_REGISTRY_PATH`        | Loads the curated source registry from another file.                                          |

`.env.local` takes precedence over `.env`. For every supported setting, see [Configuration](docs/configuration.md) and [`.env.example`](.env.example).

## Run development checks

Run the complete local check before you commit a change:

```bash
pnpm check
```

The command runs formatting verification, ESLint, TypeScript type checking, and the complete test suite. Run an individual check with one of these commands:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

## Read the documentation

- [Documentation overview](docs/index.md)
- [Quickstart](docs/quickstart.md)
- [Command-line interface](docs/cli.md)
- [Architecture Case Lab](docs/architecture-case-lab.md)
- [Architecture](docs/architecture.md)
- [Agent harness](docs/agent-harness.md)
- [Tools](docs/tools.md)
- [Testing](docs/testing.md)

## License

Birbal is available under the [MIT License](LICENSE).
