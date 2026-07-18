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
birbal evals --suite use_case_verification
birbal evals --suite use_case_pipeline_replay
```

Unknown suite IDs fail instead of returning an empty passing run.

Run the opt-in compatibility check against a configured llama.cpp server on a loopback URL:

```sh
birbal evals --suite local_model_smoke
```

This suite is intentionally excluded from the default run. It refuses non-local model providers and
non-loopback URLs, then checks for nonempty, valid structured output. When a reasoning model returns
no answer, the failure distinguishes probable reasoning-budget exhaustion using reasoning content,
finish reason, and completion-token usage.

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

`use_case_verification` checks source-grounding policy:

- Fully supported use cases are accepted.
- Evidence about a different company is rejected.
- Unsupported metrics lower confidence without erasing an otherwise real deployment.
- Claims assembled from unrelated organizations are rejected.

`use_case_pipeline_replay` runs a fixed source snapshot through extraction, verification, selection,
and digest rendering without web access or a real model.

## Design Notes

The eval framework is generic and lives in `src/framework/evals/`. It defines suites, cases, assertions, results, and trace records without referencing daily digests or enterprise use cases. App-specific suites live in `src/app/evals/`.

The generic runner owns suite selection, pass/fail aggregation, timing, and bounded concurrency. Eval cases return only their evidence: assertions, optional metadata, and optional trace data.

The OpenInference layer is intentionally lightweight. It records bounded attributes such as `openinference.span.kind`, `llm.input_messages`, `llm.output_messages`, `tool.name`, `tool.parameters`, `input.value`, and `output.value`. Message and output payloads are previewed before they enter trace results so large conversations do not make `--json` output explode. The trace recorder also supports injected clocks and ID factories for deterministic tests. Birbal can later export these traces to a full telemetry backend without changing the eval case contract.

Model-backed evals remain separate from the default suite because they depend on a configured model
provider and can drift. The local smoke suite is the first such check; broader quality scoring should
remain opt-in as well.
