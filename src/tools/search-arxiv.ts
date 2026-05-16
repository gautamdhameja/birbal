import { z } from "zod";

import { searchArxiv } from "../arxiv/client.js";
import type { ToolDefinition } from "./types.js";

const SearchArxivArgsSchema = z.strictObject({
  query: z.string().min(1),
  max_results: z.number().int().min(1).max(10).default(5),
});

export const searchArxivTool: ToolDefinition<typeof SearchArxivArgsSchema> = {
  name: "search_arxiv",
  description: "Search recent arXiv papers by query.",
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
