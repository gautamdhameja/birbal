# API Reference

## Framework barrel

`src/framework/index.ts` is the public framework barrel. It exports only the following APIs.

### Agent

- Values: `createAgentHarness`, `parseJsonAgentResponse`, `FRAMEWORK_AGENT`, and the three
  `FrameworkAgent*Schema` schemas.
- Types: `FrameworkAgentResponse`, `AgentFinalResponse`, `AgentHarnessConfig`,
  `AgentLifecycleHooks`, `AgentLogger`, `AgentResponse`, `AgentRunOptions`,
  `AgentToolCallResponse`, `ToolRunner`, `ChatMessage`, `ChatRole`, `ModelClient`,
  `ModelCompleteOptions`, and `ModelResponseFormat`.

### Structured model output

- Values: `completeStructuredWithRepair`, `describeJsonSchema`, `ModelParseError`, and
  `summarizeModelParseError`.
- Types: `CompleteStructuredWithRepairOptions`, `ModelParseErrorDetails`, and
  `StructuredModelOutputResult`.

### Tools

- Values: `FRAMEWORK_TOOLS`, `createToolExecutor`, and `ToolRegistry`.
- Types: `ToolDefinition`, `ToolError`, `ToolLogger`, `ToolRunContext`, and
  `ToolRunTraceContext`.

### Content and network

- Values: `fetchUrlContent`, `CONTENT_FETCH_STATUSES`, `fetchWithRetry`, and
  `fetchWithTimeout`.
- Types: `FetchUrlContentInput`, `FetchUrlContentResult`, `UrlContentFetchError`,
  `UrlContentFetchPolicy`, `ContentFetchStatus`, `FetchRetryOptions`, and
  `FetchTimeoutOptions`.

Internal helpers such as `parseStrictJson` and `normalizeUrl` are not barrel exports.

## Birbal application contracts

The Architecture Case Lab is an application feature, not part of the framework barrel. Import its
contracts from their application modules when extending Birbal.

### Operations and evidence

`src/app/architecture-lab/types.ts` defines the typed operation boundary:

- `ArchitectureLabOperations` groups `prepareCase`, `checkOpeningSafety`, `generateChallenge`,
  `gatherArchitectureEvidence`, and `generateReview`.
- Request/result types describe every operation and use `ArchitectureLabResult<T>` for explicit
  success or `ArchitectureLabOperationError` failure.
- Evidence types include `EvidenceSource`, `SourceDossier`, `CaseBrief`,
  `ArchitectureEvidence`, and `ArchitectureReview`.
- `ArchitectureLabResearchOperation` is the narrower research dependency injected into the
  operation factory.

`src/app/architecture-lab/operations.ts` exports `createArchitectureLabResearchRunner()` and
`createArchitectureLabOperations()` to implement those boundaries. Evidence validation remains
in `src/app/architecture-lab/evidence.ts`.

### Session, input, and output

`src/app/architecture-lab/session.ts` exports `createArchitectureLabSession()`, the session limits,
and the base input-port types. The complete contracts live in
`src/app/architecture-lab/types.ts`:

- `ArchitectureLabSession` exposes idempotent `run()` and observable `getState()` methods.
- `ArchitectureLabInputPort` supplies input and terminal-state observation and can discard input
  buffered before a newly displayed case or challenge.
- `ArchitectureLabSessionOutput` reports progress, case briefs, challenges, and retry guidance.
- `ArchitectureLabSessionResult` distinguishes completed, exited, interrupted, and failed runs.

`src/app/terminal/readline.ts` exports `createReadlineTerminalInput()`, the Node terminal adapter.
Its richer `TerminalInputPort`, input outcomes, readline factory, and lifecycle option types are
defined in `src/app/terminal/types.ts`.

### Runtime factory

`src/app/runtime/default.ts` exports `createDefaultRuntime()` and
`createDefaultToolRegistry()`. `createDefaultRuntime()` returns the `BirbalRuntime` contract from
`src/app/runtime/types.ts`: `runAgent()`, `renderToolsForPrompt()`, and `createLabSession()`.
The session factory accepts an input port and optional typed output callback, keeping terminal I/O
outside the lab state machine.
