import { z } from "zod";

const HackerNewsEnvSchema = z.strictObject({
  HACKERNEWS_SEARCH_URL: z.url(),
});

export type HackerNewsConfig = z.infer<typeof HackerNewsEnvSchema>;

export function getHackerNewsConfig(): HackerNewsConfig {
  return HackerNewsEnvSchema.parse({
    HACKERNEWS_SEARCH_URL: process.env.HACKERNEWS_SEARCH_URL,
  });
}
