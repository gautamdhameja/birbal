# Tools

Generic tool primitives live in `src/framework/tools/`. Birbal's concrete tool definitions live in `src/tools/`.

## Tool Definition

A tool is a typed function with Zod schemas:

```ts
import { z } from "zod";
import type { ToolDefinition } from "./src/framework/index.js";

const getTimeTool: ToolDefinition = {
  name: "get_time",
  description: "Get the current local time as an ISO string.",
  argsSchema: z.strictObject({}),
  resultSchema: z.strictObject({
    now: z.string(),
  }),
  async run() {
    return { now: new Date().toISOString() };
  },
};
```

## Registry

`ToolRegistry` owns registration and prompt rendering:

- `register(tool)`
- `registerMany(tools)`
- `listTools()`
- `renderToolsForPrompt()`
- `getTool(name)`

Tool rendering includes name, description, and JSON argument shape. This gives the model enough information to emit a valid `tool_call`.

## Executor

The framework tool executor:

- Looks up a tool by name.
- Validates arguments with Zod.
- Runs the tool with an abort signal.
- Validates the result schema.
- Catches exceptions.
- Returns structured errors.

Unknown tool names and invalid arguments do not throw through the agent loop. They become tool results that the model can inspect.

## Birbal Tools

Current Birbal tools include:

- `get_time`
- `search_arxiv`
- `search_hackernews`
- `search_web`
- `search_source_domain`
- `fetch_url_text`

These are handwritten tools. Birbal does not use agent SDK tool calling.
