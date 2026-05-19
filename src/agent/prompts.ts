import { readFileSync } from "node:fs";

import { PROMPTS } from "../constants/prompts.js";

const SYSTEM_AGENT_PROMPT_URL = new URL(PROMPTS.SYSTEM_AGENT_PATH, import.meta.url);

export function buildSystemPrompt(toolsText = ""): string {
  const basePrompt = readFileSync(SYSTEM_AGENT_PROMPT_URL, "utf8").trim();
  const toolsSection = toolsText.trim() || PROMPTS.NO_TOOLS_AVAILABLE;

  return `${basePrompt}\n\n${PROMPTS.AVAILABLE_TOOLS_HEADING}\n${toolsSection}`;
}
