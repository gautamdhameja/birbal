import { z } from "zod";

const ArxivEnvSchema = z.strictObject({
  ARXIV_QUERY_URL: z.url(),
});

export type ArxivConfig = z.infer<typeof ArxivEnvSchema>;

export function getArxivConfig(): ArxivConfig {
  return ArxivEnvSchema.parse({
    ARXIV_QUERY_URL: process.env.ARXIV_QUERY_URL,
  });
}
