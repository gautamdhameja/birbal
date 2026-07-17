// Purpose: Implements the llama.cpp model integration: adapter.
// Scope: Adapts the local OpenAI-compatible server to framework model contracts.

import type { ModelClient } from "../../framework/llm/types.js";
import { complete } from "./client.js";

export const llamaCppModelAdapter: ModelClient = {
  complete,
};
