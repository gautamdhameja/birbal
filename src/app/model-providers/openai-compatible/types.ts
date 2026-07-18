import type {
  ChatMessage,
  ModelClient,
  ModelCompleteOptions,
} from "../../../framework/llm/types.js";

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
