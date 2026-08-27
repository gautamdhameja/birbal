# Architecture Case Lab

Architecture Case Lab is an interactive learning workflow for practicing the design of an impactful AI system. Birbal researches a case, presents only its problem and constraints, asks the learner to propose an architecture, challenges material design choices, and produces a qualitative, source-backed review.

The existing research command remains separate. It still accepts a topic without reading stdin and returns a reading-list-shaped answer; the lab does not replace or modify that workflow.

## Start a lab

Let Birbal select a recent case with sufficient evidence:

```bash
pnpm cli -- lab
```

Or name the case you want to study:

```bash
pnpm cli -- lab "AI customer-support triage"
```

Automatic selection requires at least two HTTP(S) sources on distinct hostnames, at least one source published within the previous 24 months, and a desired-outcome claim linked to the evidence. A learner-supplied case can proceed with less evidence; the opening and final review then report `Evidence status: limited` instead of presenting uncertain claims as established facts.

## Learning flow

1. Birbal researches the supplied case or selects one automatically. It prints short progress messages while work is active.
2. The lab presents a source-linked problem, affected actors, constraints, desired outcome, and evidence status. A safety check rejects the opening before display if it exposes a reference design, vendor implementation, or complete solution.
3. Enter an architecture proposal. Drafts may span multiple lines; enter `/submit` on its own line to commit the complete draft.
4. Birbal asks one focused challenge about a material design dimension, such as state, reliability, safety, evaluation, tool boundaries, control flow, or human oversight.
5. Enter each answer as another multiline draft followed by `/submit`. After three answered challenges, the controller produces the review instead of asking a fourth question.
6. The review ends with a concrete next learning challenge and uses textual headings that remain clear in redirected, non-TTY, and screen-reader output:
   - `Strengths`
   - `Unresolved risks`
   - `Missing components`
   - `Supported facts`
   - `Sources`
   - `Architectural inference`
   - `Evaluative judgment`
   - `Evidence status`
   - `Alternatives`
   - `Next learning challenge`

Supported facts cite validated source IDs, and the source bibliography resolves every cited ID to its title, publication date, and URL without exposing private research excerpts. Inference and evaluative judgment are deliberately separate, and the review does not assign a mastery score.

Wait until the case brief or next challenge is visible before you type. The terminal may buffer lines entered while Birbal is working, but the controller intentionally discards those lines when it displays the new prompt. This checkpoint prevents pasted or typed-ahead input from becoming a response to a question you have not seen.

## Controls

Commands are recognized only when they occupy a whole input line, ignoring surrounding whitespace and letter case.

| Command   | Behavior                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/submit` | Commits the current multiline draft as the proposal or challenge answer.                                                      |
| `/finish` | Requests the best available review after a proposal. If a draft is pending, submit it first.                                  |
| `/exit`   | Leaves immediately without a review. The invocation-local transcript is discarded.                                            |
| Ctrl-D    | Ends input and exits without a review, except that an already-requested final review is allowed to finish and print.          |
| Ctrl-C    | Requests interruption. If model work is active, the request takes effect after that work settles and its result is discarded. |

Blank drafts, oversized drafts, `/finish` before a proposal, and `/finish` while a draft is pending produce a corrective message without advancing the session or calling the model for that turn.

## Output channels and statuses

Interactive material goes to stderr:

- progress while researching the case, preparing a challenge, researching post-attempt evidence, and preparing the review;
- the case brief and sources;
- challenges and retry guidance;
- trace output and failures.

Only a completed `Architecture Review` goes to stdout. This keeps the review pipeable:

```bash
pnpm cli -- lab "AI customer-support triage" > review.txt
```

The CLI returns status 0 for a completed review, `/exit`, or EOF; 130 for Ctrl-C; and 1 for terminal-input or lab failures. The terminal adapter is closed on every outcome.

## Bounds and lifecycle

- A supplied case name is limited to 500 characters.
- Each submitted proposal or answer is limited to 8,000 characters, including its newline-separated draft.
- The combined learner-and-challenge transcript is limited to 32,000 characters.
- The controller permits at most three challenge rounds.
- Each case-setup and post-attempt research run permits at most eight harness steps. Model and tool calls retain the configured output, timeout, response-size, and network-safety bounds.

Every call to the runtime's lab factory creates a fresh controller and transcript. Lab state is held only for that invocation: there is no built-in saving, resuming, exporting, learner profile, or progress history. The CLI still writes a completed review to stdout, so the caller can capture it with shell redirection as shown above.

Birbal cannot cancel an in-flight model or research call at the caller level. Ctrl-C is latched during active work; after the call settles, the result is discarded before another prompt or output is emitted. Start a new invocation after an interruption or failure.

## Component boundaries

The learning workflow is intentionally split across narrow contracts:

- The generic agent harness owns only the reusable model/tool loop and `tool_call` or `final` protocol.
- Lab operations reuse the model client, tool executor, rendered research tools, logger, and generic harness through injected functions. They return typed case, challenge, evidence, and review results.
- The session controller owns phase order, commands, drafts, transcript state, and budgets. It has no dependency on Node terminal APIs or concrete integrations.
- The Node terminal adapter translates line, EOF, Ctrl-C, and input-error events into host-neutral outcomes.
- The CLI owns stream selection, exit status, and cleanup.
- The default runtime is the only place that connects concrete clients to both the reading-list agent and the separate lab operations.

This composition demonstrates reuse without coupling the framework to an interactive product flow or coupling the lab to a provider, terminal, or the reading-list answer format.

See [Architecture](architecture.md) for the repository-level dependency map and [Testing](testing.md) for focused manual smoke steps.
