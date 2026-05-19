import type { z } from "zod";

export type ToolDefinition<
  ArgsSchema extends z.ZodType = z.ZodType,
  ResultSchema extends z.ZodType = z.ZodType,
> = {
  name: string;
  description: string;
  argsSchema: ArgsSchema;
  resultSchema: ResultSchema;
  run(args: z.infer<ArgsSchema>): Promise<z.infer<ResultSchema>>;
};

export type ToolError = {
  error: string;
};
