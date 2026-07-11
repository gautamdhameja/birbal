# API Reference

This is a high-level reference for the public framework surface exported from `src/framework/index.ts`.

## Agent

- `createAgentHarness(config)`
- `parseJsonAgentResponse(raw, options?)`
- `FRAMEWORK_AGENT`

Important types:

- `AgentHarnessConfig`
- `AgentRunOptions`
- `AgentLifecycleHooks`
- `AgentResponse`

## LLM

- `completeStructuredWithRepair(options)`
- `describeJsonSchema(schema)`
- `summarizeModelParseError(details)`
- `ModelParseError`

Important types:

- `ModelClient`
- `ChatMessage`
- `ModelCompleteOptions`
- `StructuredModelOutputResult`

## Tools

- `ToolRegistry`
- `createToolExecutor(registry, options?)`

Important types:

- `ToolDefinition`
- `ToolRunContext`
- `ToolRunTraceContext`

## Pipeline

- `runPipeline(configPathOrId, dependencies?)`
- `validateConfiguredSourceIds(config, sourceRegistry)`
- `PipelineComponentRegistry`
- `pipelineComponentRegistry`
- `registerFrameworkPipelineComponents(registry?)`
- `createInMemoryPipelineRunStore(options?)`

Important types:

- `PipelineConfig`
- `PipelineContext`
- `PipelineResult`
- `PipelineRunStore`
- `SourceCollector`
- `ContentFetcher`
- `ContentExtractor`
- `Scorer`
- `Classifier`
- `StructuredExtractor`
- `Selector`
- `Renderer`
- `ArtifactWriter`

## Evals

- `runEvalSuites(suites, options?)`
- `renderEvalRunSummary(result)`
- `renderEvalRunJson(result)`
- `OpenInferenceTraceRecorder`
- `createOpenInferenceAgentHooks(recorder, options)`
- `OPENINFERENCE`

Important types:

- `EvalSuite`
- `EvalCase`
- `EvalCaseOutput`
- `EvalRunResult`
- `EvalRunOptions`

## Content And Network

- `fetchUrlContent(input)`
- `fetchWithTimeout(input, init, options)`
- `fetchWithRetry(input, init, options)`

## Scoring

- `scoreItem(item, rubric, context)`
- `calculateWeightedFinalScore(score, weights)`

Important types:

- `Rubric`
- `RubricCriterion`
- `RubricScale`
