// Purpose: Exposes configured model provider adapters.
// Scope: Provides a small public surface for app and framework wiring.

export { getConfiguredModelProviderId, getDefaultModelClient } from "./default.js";
export type { ModelProviderId } from "./default.js";
export { openAIModelAdapter } from "./openai/index.js";
