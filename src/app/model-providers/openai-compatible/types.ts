import type {
  ChatMessage,
  ModelClient,
  ModelCompleteOptions,
} from "../../../framework/llm/types.js";
import type { fetchWithTimeout } from "../../../framework/network/fetch.js";

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

export type ModelClientLogger = {
  debug(payload: Record<string, unknown>, message?: string): void;
  warn(payload: Record<string, unknown>, message?: string): void;
};

export type OpenAICompatibleClientDependencies = {
  transport?: typeof fetchWithTimeout;
  logger?: ModelClientLogger;
  now?: () => Date;
  createId?: () => string;
};
