export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ModelResponseFormat =
  | {
      type: "json_object";
    }
  | {
      type: "json_schema";
      json_schema: {
        name: string;
        strict: boolean;
        schema: Record<string, unknown>;
      };
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
