import { z } from "zod";

import { BRAVE_SEARCH } from "../constants/brave-search.js";
import { TOOLS } from "../constants/tools.js";
import { searchSourceDomain } from "../source-search/domain.js";
import type { ToolDefinition } from "./types.js";

const SearchSourceDomainArgsSchema = z.strictObject({
  sourceId: z.string().min(1),
  query: z.string().min(1),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(BRAVE_SEARCH.MAX_RESULTS_LIMIT)
    .default(BRAVE_SEARCH.DEFAULT_MAX_RESULTS),
});

const SearchSourceDomainResultSchema = z.strictObject({
  sourceId: z.string(),
  query: z.string(),
  results: z.array(
    z.strictObject({
      id: z.string(),
      sourceId: z.string(),
      sourceName: z.string(),
      sourceType: z.string(),
      title: z.string(),
      url: z.string(),
      summary: z.string(),
      publishedAt: z.string(),
      discoveredAt: z.string(),
      contentFetchStatus: z.string(),
      raw: z.unknown(),
    }),
  ),
});

export const searchSourceDomainTool: ToolDefinition<
  typeof SearchSourceDomainArgsSchema,
  typeof SearchSourceDomainResultSchema
> = {
  name: TOOLS.SEARCH_SOURCE_DOMAIN.NAME,
  description: TOOLS.SEARCH_SOURCE_DOMAIN.DESCRIPTION,
  argsSchema: SearchSourceDomainArgsSchema,
  resultSchema: SearchSourceDomainResultSchema,
  async run(args, context) {
    return {
      sourceId: args.sourceId,
      query: args.query,
      results: await searchSourceDomain({
        sourceId: args.sourceId,
        query: args.query,
        maxResults: args.max_results,
        signal: context.signal,
      }),
    };
  },
};
