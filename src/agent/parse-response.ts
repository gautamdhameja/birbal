// Purpose: Parses Birbal agent responses with the framework JSON protocol.
// Scope: Applies app-specific response size limits before validation.

import { AGENT } from "../constants/agent.js";
import { parseJsonAgentResponse } from "../framework/agent/protocol.js";
import type { FrameworkAgentResponse } from "../framework/agent/protocol.js";

export function parseAgentResponse(raw: string): FrameworkAgentResponse {
  return parseJsonAgentResponse(raw, {
    maxResponseChars: AGENT.MAX_RESPONSE_CHARS,
  });
}
