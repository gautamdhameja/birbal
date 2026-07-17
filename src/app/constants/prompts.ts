// Purpose: Collects shared prompts constants.
// Scope: Avoids scattering repeated literals across runtime modules.

export const PROMPTS = {
  SYSTEM_AGENT_PATH: "../../prompts/system-agent.txt",
  NO_TOOLS_AVAILABLE: "No tools are currently available.",
  AVAILABLE_TOOLS_HEADING: "Available tools:",
} as const;
