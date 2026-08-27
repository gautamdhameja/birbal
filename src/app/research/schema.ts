import { z } from "zod";

import { SourceTypeSchema } from "../config/sourceRegistry.js";

export const ResearchResultSchema = z.strictObject({
  id: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  sourceType: SourceTypeSchema,
  title: z.string(),
  url: z.string(),
  summary: z.string(),
  publishedAt: z.string(),
  discoveredAt: z.string(),
});

export type ResearchResult = z.infer<typeof ResearchResultSchema>;
