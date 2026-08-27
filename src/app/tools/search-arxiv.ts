import { z } from "zod";

import { TOOLS } from "../constants/tools.js";
import type { ArxivSearch } from "../arxiv/types.js";
import type { ToolDefinition } from "../../framework/tools/types.js";

const SearchArxivArgsSchema = z.strictObject({
  query: z.string().min(1),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(TOOLS.MAX_RESULTS_LIMIT)
    .default(TOOLS.DEFAULT_MAX_RESULTS),
});

const SearchArxivResultSchema = z.strictObject({
  query: z.string(),
  results: z.array(
    z.strictObject({
      title: z.string(),
      url: z.string(),
      summary: z.string(),
      authors: z.array(z.string()),
      published: z.string(),
    }),
  ),
});

export function createSearchArxivTool(
  runSearch: ArxivSearch,
): ToolDefinition<typeof SearchArxivArgsSchema, typeof SearchArxivResultSchema> {
  return {
    name: TOOLS.SEARCH_ARXIV.NAME,
    description: TOOLS.SEARCH_ARXIV.DESCRIPTION,
    argsSchema: SearchArxivArgsSchema,
    resultSchema: SearchArxivResultSchema,
    async run(args, context) {
      return {
        query: args.query,
        results: await runSearch({
          query: args.query,
          maxResults: args.max_results,
          signal: context.signal,
        }),
      };
    },
  };
}
