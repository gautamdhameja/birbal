import { AGENT } from "../constants/agent.js";
import { AgentResponseSchema } from "./protocol.js";
import type { AgentResponse } from "./protocol.js";

export function parseAgentResponse(raw: string): AgentResponse {
  if (raw.length > AGENT.MAX_RESPONSE_CHARS) {
    throw new Error(`Agent response exceeded ${AGENT.MAX_RESPONSE_CHARS} characters.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new Error("Agent response must be valid JSON with no surrounding text.");
  }

  return AgentResponseSchema.parse(parsed);
}
