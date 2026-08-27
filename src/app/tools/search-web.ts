import { z } from "zod";

import { TOOLS } from "../constants/tools.js";
import type { WebSearchPort } from "../source-search/types.js";
import type { ToolDefinition } from "../../framework/tools/types.js";

const SearchWebArgsSchema = z.strictObject({
  query: z.string().min(1),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(TOOLS.MAX_RESULTS_LIMIT)
    .default(TOOLS.DEFAULT_MAX_RESULTS),
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
    }),
  ),
});

export function createSearchWebTool(
  runSearch: WebSearchPort,
): ToolDefinition<typeof SearchWebArgsSchema, typeof SearchWebResultSchema> {
  return {
    name: TOOLS.SEARCH_WEB.NAME,
    description: TOOLS.SEARCH_WEB.DESCRIPTION,
    argsSchema: SearchWebArgsSchema,
    resultSchema: SearchWebResultSchema,
    async run(args, context) {
      return {
        query: args.query,
        results: await runSearch({
          query: args.query,
          maxResults: args.max_results,
          freshness: args.freshness,
          signal: context.signal,
        }),
      };
    },
  };
}
