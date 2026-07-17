// Purpose: Implements the arXiv search integration: config.
// Scope: Wraps API configuration and parsing for the arXiv tool.

import { z } from "zod";

import { ARXIV } from "../constants/arxiv.js";
import { allowedHostErrorMessage, isAllowedHttpUrl } from "../http/url.js";

const ArxivEnvSchema = z.strictObject({
  ARXIV_QUERY_URL: z
    .url()
    .refine((value) => isAllowedHttpUrl(value, ARXIV.ALLOWED_HOSTS), allowedHostErrorMessage()),
});

export type ArxivConfig = z.infer<typeof ArxivEnvSchema>;

export function getArxivConfig(): ArxivConfig {
  return ArxivEnvSchema.parse({
    ARXIV_QUERY_URL: process.env.ARXIV_QUERY_URL,
  });
}
