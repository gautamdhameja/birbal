import { z } from "zod";

import type { ToolDefinition } from "./types.js";

const GetTimeArgsSchema = z.strictObject({});

export const getTimeTool: ToolDefinition<typeof GetTimeArgsSchema> = {
  name: "get_time",
  description: "Get the current local time as an ISO string.",
  argsSchema: GetTimeArgsSchema,
  async run() {
    return {
      now: new Date().toISOString(),
    };
  },
};
