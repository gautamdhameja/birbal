import type { z } from "zod";

export type ToolRunContext = {
  signal?: AbortSignal;
};

export type ToolDefinition<
  ArgsSchema extends z.ZodType = z.ZodType,
  ResultSchema extends z.ZodType = z.ZodType,
> = {
  name: string;
  description: string;
  argsSchema: ArgsSchema;
  resultSchema: ResultSchema;
  run(args: z.infer<ArgsSchema>, context: ToolRunContext): Promise<z.infer<ResultSchema>>;
};

export type ToolError = {
  error: string;
};

export type ToolRunTraceContext = {
  traceId?: string;
  modelPassId?: string;
  step?: number;
};
