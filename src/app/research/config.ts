import { fileURLToPath } from "node:url";

import { loadJsonConfig } from "../../framework/config/loadJsonConfig.js";
import { ResearchConfigSchema } from "./schema.js";
import type { ResearchConfig } from "./types.js";

const BUNDLED_RESEARCH_CONFIG_PATH = fileURLToPath(
  new URL("../../../config/research.json", import.meta.url),
);

function defaultResearchConfigPath(): string {
  return process.env.RESEARCH_CONFIG_PATH?.trim() || BUNDLED_RESEARCH_CONFIG_PATH;
}

export function loadResearchConfig(configPath = defaultResearchConfigPath()): ResearchConfig {
  return loadJsonConfig(configPath, ResearchConfigSchema, {
    invalidJson: "Invalid research config JSON:",
    invalidConfig: "Invalid research config:",
  });
}
