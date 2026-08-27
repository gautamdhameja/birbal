# CLI

Run a research task directly:

```bash
birbal "Find primary sources about agent evaluation"
```

The explicit command is equivalent:

```bash
birbal agent "Find primary sources about agent evaluation"
```

With no task, Birbal researches recent LLM-agent engineering developments. Add `--trace` to enable debug logs and print the registered tools.

The CLI prints only the agent's final answer to stdout. Logs and trace details go to stderr.
