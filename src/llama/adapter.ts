import type { ModelClient } from "../framework/llm/types.js";
import { complete } from "./client.js";

export const llamaCppModelAdapter: ModelClient = {
  complete,
};
