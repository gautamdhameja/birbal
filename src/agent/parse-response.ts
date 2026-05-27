import { AGENT } from "../constants/agent.js";
import { parseJsonAgentResponse } from "../framework/agent/protocol.js";
import type { AgentResponse } from "./protocol.js";

export function parseAgentResponse(raw: string): AgentResponse {
  return parseJsonAgentResponse(raw, {
    maxResponseChars: AGENT.MAX_RESPONSE_CHARS,
  });
}
