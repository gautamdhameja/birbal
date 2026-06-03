# Architecture

Birbal is split into a reusable framework layer and a concrete research app layer.

```text
src/framework/
  agent/       reusable agent harness
  tools/       generic tool registry and executor
  llm/         model client types and structured repair
  pipeline/    generic config-driven pipeline orchestration
  content/     framework-level URL content fetching
  network/     retry and timeout helpers
  scoring/     rubric primitives

src/model-providers/ provider selection and OpenAI-compatible transport
src/llama/      llama.cpp adapter
src/tools/      Birbal tool definitions
src/pipelines/  Birbal pipeline components
src/daily/      daily reading app logic
src/db/         SQLite persistence
```

The framework does not know about enterprise AI. It operates on generic interfaces and `unknown` payloads at component boundaries. The Birbal app registers concrete collectors, fetchers, scorers, extractors, selectors, and renderers.

## Agent Flow

```text
User task
   |
   v
Agent Harness
   |
   | system prompt + user task + rendered tools
   v
Model Adapter
   |
   | strict JSON response
   v
Protocol Parser
   |
   +-- final       -> return answer
   +-- clarify     -> return clarification request
   +-- tool_call   -> validate and execute tool
                         |
                         v
                    tool_result JSON
                         |
                         v
                    append to messages and continue
```

## Pipeline Flow

```text
Pipeline config
   |
   v
Load source registry
   |
   v
Resolve components
   |
   v
Collect -> Fetch -> Extract/Score/Classify -> Select -> Render -> Write
   |
   v
Run metadata and artifacts
```

Pipeline behavior comes from JSON config and registered components. The orchestrator is responsible for ordering, concurrency, failure policy, counts, errors, and run metadata.
