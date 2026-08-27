# CLI

Run a research task directly:

```bash
pnpm cli -- "Find primary sources about agent evaluation"
```

The explicit command is equivalent:

```bash
pnpm cli -- agent "Find primary sources about agent evaluation"
```

With no task, Birbal researches recent LLM-agent engineering developments. Add `--trace` to enable
debug logs for that invocation and print the registered tools. Trace settings are passed to the new
runtime and do not persist into later CLI invocations in the same process.

The CLI prints only the agent's final answer to stdout. Logs and trace details go to stderr.

## Architecture Case Lab

Let Birbal select a recent case:

```bash
pnpm cli -- lab
```

Or supply a case:

```bash
pnpm cli -- lab "AI customer-support triage"
```

Write a proposal or challenge answer across as many lines as needed, then enter `/submit` on its own line. The other whole-line controls are:

- `/finish` produces the best available review after a proposal has been submitted. A pending draft must be submitted first.
- `/exit` leaves immediately without producing a review.

Birbal automatically produces a review after the third answered challenge. Research progress, case context, challenges, validation messages, trace output, and failures go to stderr. Only a completed `Architecture Review` goes to stdout. An ordinary exit or EOF returns status 0, Ctrl-C returns 130, and an input or lab failure returns 1.

Each invocation creates a fresh session. Nothing can be saved or resumed. A model or research request already in progress cannot be cancelled at the caller level: Ctrl-C is latched, the active request is allowed to settle, its result is discarded, and the CLI then returns 130.

See [Architecture Case Lab](architecture-case-lab.md) for the complete workflow and limits.
