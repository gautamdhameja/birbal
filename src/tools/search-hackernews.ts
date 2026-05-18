import { z } from "zod";

import { TOOLS } from "../constants.js";
import { searchHackerNews } from "../hackernews/client.js";
import type { ToolDefinition } from "./types.js";

const SearchHackerNewsArgsSchema = z.strictObject({
  query: z.string().min(1),
  max_results: z.number().int().min(1).max(TOOLS.MAX_RESULTS_LIMIT).default(TOOLS.DEFAULT_MAX_RESULTS),
});

export const searchHackerNewsTool: ToolDefinition<typeof SearchHackerNewsArgsSchema> = {
  name: TOOLS.SEARCH_HACKER_NEWS.NAME,
  description: TOOLS.SEARCH_HACKER_NEWS.DESCRIPTION,
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
