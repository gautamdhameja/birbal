import type {
  ChatMessage,
  ModelClient,
  ModelCompleteOptions,
} from "../../../framework/llm/types.js";
import type { fetchWithTimeout } from "../../../framework/network/fetch.js";
import type { DebugWarnLogger } from "../../../framework/logging/debug-warn.js";

export type OpenAICompatibleTokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type OpenAICompatibleCompletion = {
  content: string;
  reasoningContent?: string;
  finishReason?: string;
  usage?: OpenAICompatibleTokenUsage;
};

export type OpenAICompatibleModelClient = ModelClient & {
  completeDetailed(
    messages: ChatMessage[],
    options?: ModelCompleteOptions,
  ): Promise<OpenAICompatibleCompletion>;
};

export type OpenAICompatibleClientDependencies = {
  transport?: typeof fetchWithTimeout;
  logger?: DebugWarnLogger;
  now?: () => Date;
  createId?: () => string;
};
