import { z } from "zod";

import { searchHackerNews } from "../hackernews/client.js";
import type { ToolDefinition } from "./types.js";

const SearchHackerNewsArgsSchema = z.strictObject({
  query: z.string().min(1),
  max_results: z.number().int().min(1).max(10).default(5),
});

export const searchHackerNewsTool: ToolDefinition<typeof SearchHackerNewsArgsSchema> = {
  name: "search_hackernews",
  description: "Search recent Hacker News stories by query.",
  argsSchema: SearchHackerNewsArgsSchema,
  async run(args) {
    return {
      query: args.query,
      results: await searchHackerNews({
        query: args.query,
        maxResults: args.max_results,
      }),
    };
  },
};
