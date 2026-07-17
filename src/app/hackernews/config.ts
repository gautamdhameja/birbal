// Purpose: Implements the Hacker News search integration: config.
// Scope: Normalizes Algolia API responses for tools and collectors.

import { z } from "zod";

import { HACKER_NEWS } from "../constants/hacker-news.js";
import { allowedHostErrorMessage, isAllowedHttpUrl } from "../http/url.js";

const HackerNewsEnvSchema = z.strictObject({
  HACKERNEWS_SEARCH_URL: z
    .url()
    .refine(
      (value) => isAllowedHttpUrl(value, HACKER_NEWS.ALLOWED_HOSTS),
      allowedHostErrorMessage(),
    ),
});

export type HackerNewsConfig = z.infer<typeof HackerNewsEnvSchema>;

export function getHackerNewsConfig(): HackerNewsConfig {
  return HackerNewsEnvSchema.parse({
    HACKERNEWS_SEARCH_URL: process.env.HACKERNEWS_SEARCH_URL,
  });
}
