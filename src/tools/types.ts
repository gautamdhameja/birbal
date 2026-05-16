import type { z } from "zod";

export type ToolDefinition<ArgsSchema extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  argsSchema: ArgsSchema;
  run(args: z.infer<ArgsSchema>): Promise<unknown>;
};

export type ToolError = {
  error: string;
};
