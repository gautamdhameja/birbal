# Birbal

Birbal is a local TypeScript AI research scout. It talks to a llama.cpp-compatible chat completions endpoint, enforces strict JSON for agent/tool interactions, and includes a generic pipeline runner for collecting, fetching, extracting, selecting, storing, and rendering research artifacts.

The current workflows are a daily enterprise AI reading digest and an enterprise AI use-case scout. Runtime configuration comes from environment variables and JSON config files, schemas are validated with Zod, and integration code is kept separate from pipeline orchestration and rendering.
