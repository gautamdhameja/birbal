import { z } from "zod";

export const FetchUrlTextResultSchema = z.strictObject({
  url: z.string(),
  title: z.string(),
  plainText: z.string(),
  canonicalUrl: z.string().optional(),
  detectedPaywall: z.boolean(),
  contentLength: z.number().int().min(0),
});
