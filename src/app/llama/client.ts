// Purpose: Exposes the llama.cpp completion function.
// Scope: Delegates local llama.cpp calls to the shared OpenAI-compatible transport.

import { createOpenAICompatibleModelClient } from "../model-providers/openai-compatible/client.js";
import { getLlamaConfig } from "./config.js";
import type { ChatMessage, CompleteOptions } from "./schema.js";

const llamaClient = createOpenAICompatibleModelClient(getLlamaConfig);

export async function complete(
  messages: ChatMessage[],
  options: CompleteOptions = {},
): Promise<string> {
  return llamaClient.complete(messages, options);
}
