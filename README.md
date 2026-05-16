# Birbal

Birbal is a small TypeScript harness for experimenting with a local LLM as an agent. It talks to a llama.cpp-compatible chat completions endpoint, enforces a strict JSON response protocol, and runs simple handwritten tools through a traced agent loop.

The project is intentionally minimal: runtime configuration comes from environment variables, schemas are validated with Zod, and tool execution is kept separate from tool registration.
