import { join } from "node:path";

import { z } from "zod";

import { loadJsonConfig } from "../../framework/config/loadJsonConfig.js";

const ResearchPreferenceTextSchema = z.string().trim().min(1);

const ResearchConfigSchema = z.strictObject({
  interests: z.array(ResearchPreferenceTextSchema).min(1),
  avoid: z.array(ResearchPreferenceTextSchema),
  preferredDifficulty: z.enum(["beginner", "intermediate", "advanced"]),
  maxReadingListItems: z.number().int().min(1).max(20),
});

export type ResearchConfig = z.infer<typeof ResearchConfigSchema>;

function defaultResearchConfigPath(): string {
  return join(process.cwd(), "config", "research.json");
}

export function loadResearchConfig(configPath = defaultResearchConfigPath()): ResearchConfig {
  return loadJsonConfig(configPath, ResearchConfigSchema, {
    invalidJson: "Invalid research config JSON:",
    invalidConfig: "Invalid research config:",
  });
}
