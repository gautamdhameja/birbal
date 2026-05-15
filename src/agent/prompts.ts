import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SYSTEM_AGENT_PROMPT_PATH = resolve(process.cwd(), "prompts/system-agent.txt");

export function buildSystemPrompt(toolsText: string): string {
  const basePrompt = readFileSync(SYSTEM_AGENT_PROMPT_PATH, "utf8").trim();
  const toolsSection = toolsText.trim() || "No tools are currently available.";

  return `${basePrompt}\n\nAvailable tools:\n${toolsSection}`;
}
