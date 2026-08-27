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
