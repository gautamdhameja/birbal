import { z } from "zod";

import { TOOLS } from "../constants/tools.js";
import { searchHackerNews } from "../hackernews/client.js";
import type { ToolDefinition } from "./types.js";

const SearchHackerNewsArgsSchema = z.strictObject({
  query: z.string().min(1),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(TOOLS.MAX_RESULTS_LIMIT)
    .default(TOOLS.DEFAULT_MAX_RESULTS),
});

const SearchHackerNewsResultSchema = z.strictObject({
  query: z.string(),
  results: z.array(
    z.strictObject({
      title: z.string(),
      url: z.string(),
      hn_url: z.string(),
      points: z.number().nullable(),
      author: z.string(),
      created_at: z.string(),
    }),
  ),
});

export const searchHackerNewsTool: ToolDefinition<
  typeof SearchHackerNewsArgsSchema,
  typeof SearchHackerNewsResultSchema
> = {
  name: TOOLS.SEARCH_HACKER_NEWS.NAME,
  description: TOOLS.SEARCH_HACKER_NEWS.DESCRIPTION,
  argsSchema: SearchHackerNewsArgsSchema,
  resultSchema: SearchHackerNewsResultSchema,
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
