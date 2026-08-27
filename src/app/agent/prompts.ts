import { readFileSync } from "node:fs";

import { loadSourceRegistry } from "../config/sourceRegistry.js";
import { loadResearchConfig } from "../research/config.js";

const SYSTEM_AGENT_PROMPT_URL = new URL("../../../prompts/system-agent.txt", import.meta.url);
const NO_TOOLS_AVAILABLE = "No tools are currently available.";
const AVAILABLE_TOOLS_HEADING = "Available tools:";

export function buildSystemPrompt(toolsText = ""): string {
  const basePrompt = readFileSync(SYSTEM_AGENT_PROMPT_URL, "utf8").trim();
  const toolsSection = toolsText.trim() || NO_TOOLS_AVAILABLE;
  const research = loadResearchConfig();
  const enabledSources = loadSourceRegistry()
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
