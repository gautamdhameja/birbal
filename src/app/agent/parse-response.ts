import { FRAMEWORK_AGENT as AGENT } from "../../framework/agent/constants.js";
import { parseJsonAgentResponse } from "../../framework/agent/protocol.js";
import type { FrameworkAgentResponse } from "../../framework/agent/protocol.js";

export function parseAgentResponse(raw: string): FrameworkAgentResponse {
  return parseJsonAgentResponse(raw, {
    maxResponseChars: AGENT.MAX_RESPONSE_CHARS,
  });
}
