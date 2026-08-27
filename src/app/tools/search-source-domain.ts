import { z } from "zod";

import { TOOLS } from "../constants/tools.js";
import { ResearchResultSchema } from "../research/schema.js";
import { WEB_SEARCH_POLICY } from "../source-search/policy.js";
import type { SourceDomainSearch } from "../source-search/types.js";
import type { ToolDefinition } from "../../framework/tools/types.js";

const SearchSourceDomainArgsSchema = z.strictObject({
  sourceId: z.string().min(1),
  query: z.string().min(1),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(WEB_SEARCH_POLICY.MAX_RESULTS_LIMIT)
    .default(WEB_SEARCH_POLICY.DEFAULT_MAX_RESULTS),
});

const SearchSourceDomainResultSchema = z.strictObject({
  sourceId: z.string(),
  query: z.string(),
  results: z.array(ResearchResultSchema),
});

export function createSearchSourceDomainTool(
  runSearch: SourceDomainSearch,
): ToolDefinition<typeof SearchSourceDomainArgsSchema, typeof SearchSourceDomainResultSchema> {
  return {
    name: TOOLS.SEARCH_SOURCE_DOMAIN.NAME,
    description: TOOLS.SEARCH_SOURCE_DOMAIN.DESCRIPTION,
    argsSchema: SearchSourceDomainArgsSchema,
    resultSchema: SearchSourceDomainResultSchema,
    async run(args, context) {
      return {
        sourceId: args.sourceId,
        query: args.query,
        results: await runSearch({
          sourceId: args.sourceId,
          query: args.query,
          maxResults: args.max_results,
          signal: context.signal,
        }),
      };
    },
  };
}
