import { readFileSync } from "node:fs";

const SYSTEM_AGENT_PROMPT_URL = new URL("../../prompts/system-agent.txt", import.meta.url);

export function buildSystemPrompt(toolsText = ""): string {
  const basePrompt = readFileSync(SYSTEM_AGENT_PROMPT_URL, "utf8").trim();
  const toolsSection = toolsText.trim() || "No tools are currently available.";

  return `${basePrompt}\n\nAvailable tools:\n${toolsSection}`;
}
