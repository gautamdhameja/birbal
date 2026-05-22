import { z } from "zod";

import { BRAVE_SEARCH } from "../constants/brave-search.js";
import { allowedHostErrorMessage, isAllowedHttpUrl } from "../http/url.js";

const BraveSearchConfigSchema = z.strictObject({
  BRAVE_SEARCH_API_KEY: z.string().min(1, BRAVE_SEARCH.ERRORS.MISSING_API_KEY),
  BRAVE_SEARCH_URL: z
    .url()
    .refine(
      (value) => isAllowedHttpUrl(value, BRAVE_SEARCH.ALLOWED_HOSTS),
      allowedHostErrorMessage(),
    ),
});

export type BraveSearchConfig = z.infer<typeof BraveSearchConfigSchema>;

export function getBraveSearchConfig(): BraveSearchConfig {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(BRAVE_SEARCH.ERRORS.MISSING_API_KEY);
  }
  const searchUrl = process.env.BRAVE_SEARCH_URL?.trim() || BRAVE_SEARCH.WEB_SEARCH_URL;

  return BraveSearchConfigSchema.parse({
    BRAVE_SEARCH_API_KEY: apiKey,
    BRAVE_SEARCH_URL: searchUrl,
  });
}
