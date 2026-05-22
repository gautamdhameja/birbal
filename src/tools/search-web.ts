import { z } from "zod";

import { BRAVE_SEARCH } from "../constants/brave-search.js";
import { TOOLS } from "../constants/tools.js";
import { searchWeb } from "../brave-search/client.js";
import type { ToolDefinition } from "./types.js";

const SearchWebArgsSchema = z.strictObject({
  query: z.string().min(1),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(BRAVE_SEARCH.MAX_RESULTS_LIMIT)
    .default(BRAVE_SEARCH.DEFAULT_MAX_RESULTS),
  freshness: z.string().optional(),
});

const SearchWebResultSchema = z.strictObject({
  query: z.string(),
  results: z.array(
    z.strictObject({
      title: z.string(),
      url: z.string(),
      description: z.string(),
      publishedAt: z.string().optional(),
      sourceName: z.string().optional(),
      raw: z.unknown(),
    }),
  ),
});

export const searchWebTool: ToolDefinition<
  typeof SearchWebArgsSchema,
  typeof SearchWebResultSchema
> = {
  name: TOOLS.SEARCH_WEB.NAME,
  description: TOOLS.SEARCH_WEB.DESCRIPTION,
  argsSchema: SearchWebArgsSchema,
  resultSchema: SearchWebResultSchema,
  async run(args) {
    return {
      query: args.query,
      results: await searchWeb({
        query: args.query,
        maxResults: args.max_results,
        freshness: args.freshness,
      }),
    };
  },
};
