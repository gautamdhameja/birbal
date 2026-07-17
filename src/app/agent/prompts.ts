import { readFileSync } from "node:fs";

const SYSTEM_AGENT_PROMPT_URL = new URL("../../../prompts/system-agent.txt", import.meta.url);
const NO_TOOLS_AVAILABLE = "No tools are currently available.";
const AVAILABLE_TOOLS_HEADING = "Available tools:";

export function buildSystemPrompt(toolsText = ""): string {
  const basePrompt = readFileSync(SYSTEM_AGENT_PROMPT_URL, "utf8").trim();
  const toolsSection = toolsText.trim() || NO_TOOLS_AVAILABLE;

  return `${basePrompt}\n\n${AVAILABLE_TOOLS_HEADING}\n${toolsSection}`;
}
