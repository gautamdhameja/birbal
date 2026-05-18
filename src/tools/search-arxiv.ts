import { z } from "zod";

import { searchArxiv } from "../arxiv/client.js";
import { TOOLS } from "../constants.js";
import type { ToolDefinition } from "./types.js";

const SearchArxivArgsSchema = z.strictObject({
  query: z.string().min(1),
  max_results: z.number().int().min(1).max(TOOLS.MAX_RESULTS_LIMIT).default(TOOLS.DEFAULT_MAX_RESULTS),
});

export const searchArxivTool: ToolDefinition<typeof SearchArxivArgsSchema> = {
  name: TOOLS.SEARCH_ARXIV.NAME,
  description: TOOLS.SEARCH_ARXIV.DESCRIPTION,
  argsSchema: SearchArxivArgsSchema,
  async run(args) {
    return {
      query: args.query,
      results: await searchArxiv({
        query: args.query,
        maxResults: args.max_results,
      }),
    };
  },
};
