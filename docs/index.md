# Birbal

Birbal is a local research agent that investigates a question and returns a concise reading list with source links, reasons to read, and key takeaways.

Its implementation keeps the agent loop explicit: model calls, strict JSON protocol parsing, tool dispatch, source search, safe page fetching, and final-answer rendering. There is no result persistence or publishing subsystem.

Start with [Quickstart](quickstart.md) and [CLI](cli.md). Read [Architecture](architecture.md), [Agent Harness](agent-harness.md), and [Tools](tools.md) to understand the implementation.
