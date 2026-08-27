import { readFileSync } from "node:fs";

import { loadSourceRegistry } from "../config/sourceRegistry.js";
import type { SourceRegistry } from "../config/sourceRegistryTypes.js";
import { loadResearchConfig } from "../research/config.js";
import type { ResearchConfig } from "../research/types.js";

const SYSTEM_AGENT_PROMPT_URL = new URL("../../../prompts/system-agent.txt", import.meta.url);
const NO_TOOLS_AVAILABLE = "No tools are currently available.";
const AVAILABLE_TOOLS_HEADING = "Available tools:";

export type SystemPromptInputs = {
  template: string;
  toolsText?: string;
  research: ResearchConfig;
  sourceRegistry: SourceRegistry;
};

export type SystemPromptBuilderDependencies = {
  loadTemplate?: () => string;
  loadResearchConfig?: () => ResearchConfig;
  loadSourceRegistry?: () => SourceRegistry;
};

function loadBundledTemplate(): string {
  return readFileSync(SYSTEM_AGENT_PROMPT_URL, "utf8");
}

export function renderSystemPrompt({
  template,
  toolsText = "",
  research,
  sourceRegistry,
}: SystemPromptInputs): string {
  const basePrompt = template.trim();
  const toolsSection = toolsText.trim() || NO_TOOLS_AVAILABLE;
  const enabledSources = sourceRegistry.sources
    .filter((source) => source.enabled)
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

export function createSystemPromptBuilder(
  dependencies: SystemPromptBuilderDependencies = {},
): (toolsText?: string) => string {
  const loadTemplate = dependencies.loadTemplate ?? loadBundledTemplate;
  const loadResearch = dependencies.loadResearchConfig ?? loadResearchConfig;
  const loadSources = dependencies.loadSourceRegistry ?? loadSourceRegistry;

  return (toolsText = "") =>
    renderSystemPrompt({
      template: loadTemplate(),
      toolsText,
      research: loadResearch(),
      sourceRegistry: loadSources(),
    });
}

export function buildSystemPrompt(
  toolsText = "",
  dependencies: SystemPromptBuilderDependencies = {},
): string {
  return createSystemPromptBuilder(dependencies)(toolsText);
}
