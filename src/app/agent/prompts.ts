import { readFileSync } from "node:fs";

import { loadSourceRegistry } from "../config/sourceRegistry.js";
import type { SourceRegistry } from "../config/sourceRegistryTypes.js";
import { loadResearchConfig } from "../research/config.js";
import type { ResearchConfig } from "../research/types.js";

const SYSTEM_AGENT_PROMPT_URL = new URL("../../../prompts/system-agent.txt", import.meta.url);
const NO_TOOLS_AVAILABLE = "No tools are currently available.";
const AVAILABLE_TOOLS_HEADING = "Available tools:";

type BuildSystemPromptDependencies = {
  loadResearchConfig?: () => ResearchConfig;
  loadSourceRegistry?: () => SourceRegistry;
};

export function buildSystemPrompt(
  toolsText = "",
  dependencies: BuildSystemPromptDependencies = {},
): string {
  const basePrompt = readFileSync(SYSTEM_AGENT_PROMPT_URL, "utf8").trim();
  const toolsSection = toolsText.trim() || NO_TOOLS_AVAILABLE;
  const research = (dependencies.loadResearchConfig ?? loadResearchConfig)();
  const enabledSources = (dependencies.loadSourceRegistry ?? loadSourceRegistry)()
    .sources.filter((source) => source.enabled)
    .map((source) => `${source.id} (${source.name})`)
    .join(", ");
  const researchContext = [
    "Research preferences:",
    `Interests: ${research.interests.join(", ")}`,
    `Avoid: ${research.avoid.join(", ") || "none"}`,
    `Difficulty: ${research.preferredDifficulty}`,
    `Maximum reading-list items: ${research.maxReadingListItems}`,
    `Enabled curated sources: ${enabledSources || "none"}`,
  ].join("\n");

  return `${basePrompt}\n\n${researchContext}\n\n${AVAILABLE_TOOLS_HEADING}\n${toolsSection}`;
}
