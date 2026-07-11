# Evals

Birbal includes deterministic eval suites for the agent harness and the enterprise use-case app. These are not replacements for unit tests. They are behavior checks that exercise the full loop around model-facing protocol, tool handoff, structured output repair, extraction filters, and trace shape.

The first eval layer is deliberately local and deterministic. It uses scripted model responses instead of real model calls, so it can run in CI or during prompt refactors without network access, token cost, or model drift. The trace recorder emits OpenInference-style JSON spans for LLM calls, tool calls, parse failures, and parsed agent responses, which keeps the result compatible with the same observability vocabulary used by tools such as Phoenix and OpenTelemetry-backed tracing systems.

## Commands

Run all eval suites:

```sh
birbal evals
pnpm evals
```

Print the full result as JSON:

```sh
birbal evals --json
```

Run one suite:

```sh
birbal evals --suite agent_harness
birbal evals --suite use_case_extraction
```

Unknown suite IDs fail instead of returning an empty passing run.

## Current Suites

`agent_harness` checks the generic harness loop:

- The model can request a tool with strict JSON.
- The harness validates and executes the tool call.
- The tool result is appended back to the conversation.
- The model can return a final answer.
- One invalid protocol response can be repaired.
- OpenInference-style LLM, tool, and parse spans are recorded.

`use_case_extraction` checks the enterprise research app:

- A concrete customer story extracts to one validated enterprise use case.
- Generic framework or best-practice content is filtered out.
- Extracted use cases require a named enterprise company or organization rather than a generic actor.
- The summary is checked for workflow-specific content.

## Design Notes

The eval framework is generic and lives in `src/framework/evals/`. It defines suites, cases, assertions, results, and trace records without referencing daily digests or enterprise use cases. App-specific suites live in `src/evals/`.

The generic runner owns suite selection, pass/fail aggregation, timing, and bounded concurrency. Eval cases return only their evidence: assertions, optional metadata, and optional trace data.

The OpenInference layer is intentionally lightweight. It records bounded attributes such as `openinference.span.kind`, `llm.input_messages`, `llm.output_messages`, `tool.name`, `tool.parameters`, `input.value`, and `output.value`. Message and output payloads are previewed before they enter trace results so large conversations do not make `--json` output explode. The trace recorder also supports injected clocks and ID factories for deterministic tests. Birbal can later export these traces to a full telemetry backend without changing the eval case contract.

The next useful eval layer is model-backed, not deterministic. Add it only where deterministic cases are insufficient, such as ranking output quality, newsletter summary quality, or source-grounding judgment. Keep those evals separate from the default suite because they depend on a configured model provider and cost money to run.
