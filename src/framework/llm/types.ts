export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ModelResponseFormat = {
  type: "json_object";
};

export type ModelCompleteOptions = {
  temperature?: number;
  maxOutputTokens?: number;
  response_format?: ModelResponseFormat;
  traceId?: string;
  traceLabel?: string;
};

export type ModelClient = {
  complete(messages: ChatMessage[], options?: ModelCompleteOptions): Promise<string>;
};
