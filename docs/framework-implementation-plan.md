# Framework Extraction Plan

Birbal v1 proves the agent harness and enterprise research scout. The next phase is to separate the reusable harness framework from the Birbal application so new agents and pipelines can be built without inheriting enterprise-research assumptions.

## Pass 1: Cleanup Into Framework Boundaries

- Define framework-level LLM contracts:
  - generic chat messages
  - generic completion options
  - `ModelClient` interface
  - llama.cpp adapter remains an app/runtime implementation
- Move generic tool primitives into the framework:
  - `ToolDefinition`
  - `ToolRegistry`
  - tool prompt rendering
  - tool executor with validation, timeout, result validation, and structured errors
- Extract a configurable agent harness orchestrator:
  - dependency-injected model client
  - dependency-injected tool executor
  - configurable prompt builder
  - configurable response parser
  - framework-level final/tool/clarify protocol helpers
- Keep the existing Birbal CLI behavior through a thin adapter:
  - same `runAgent(task, options)` API
  - same tools
  - same llama.cpp client
  - same JSON protocol
- Split pipeline component registration:
  - framework-level defaults only include generic components
  - Birbal-specific collectors/scorers/extractors/renderers move behind app registration
  - CLI registers Birbal app components explicitly
- Add tests proving framework reuse:
  - mock model + mock tool agent loop
  - generic tool registry/executor behavior
  - pipeline registry with generic writer

## Pass 2: Production Framework Hardening

- Add stable public module surfaces:
  - `src/framework/agent`
  - `src/framework/tools`
  - `src/framework/llm`
  - `src/framework/pipeline`
- Add lifecycle hooks:
  - before model call
  - after model call
  - before tool call
  - after tool call
  - on parse failure
  - on max steps
- Add model/provider adapters:
  - keep llama.cpp as the only real adapter for v1
  - define the adapter interface so other providers can be added later without changing harness orchestration
- Make persistence adapter-based:
  - generic run store interface
  - SQLite implementation
  - in-memory implementation for tests/examples
- Make pipeline components packageable:
  - component registration modules per application
  - no app-specific imports from framework modules
  - config validation independent of app component IDs
- Add example agents:
  - minimal tool-using agent
  - small static pipeline that collects records and writes an artifact
- Add docs:
  - architecture overview
  - framework API
  - Birbal app layering
  - extension guide
  - production checklist

## Pass 3: Open-Source Readiness

- Stabilize naming and exports.
- Add README examples that do not depend on Birbal enterprise research.
- Add CI commands for format, lint, typecheck, test, audit.
- Add supply-chain guidance for dependency updates.
- Add security notes for tool execution, URL fetching, and persistence.
- Add versioned config examples.
- Add a migration note explaining Birbal as the first app built on the harness.
