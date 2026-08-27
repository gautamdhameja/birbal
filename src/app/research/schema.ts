import { z } from "zod";

import { SourceTypeSchema } from "../config/sourceRegistrySchema.js";

const ResearchPreferenceTextSchema = z.string().trim().min(1);

export const ResearchConfigSchema = z.strictObject({
  interests: z.array(ResearchPreferenceTextSchema).min(1),
  avoid: z.array(ResearchPreferenceTextSchema),
  preferredDifficulty: z.enum(["beginner", "intermediate", "advanced"]),
  maxReadingListItems: z.number().int().min(1).max(20),
});

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
