import { AGENT } from "../constants/agent.js";
import { parseJson } from "../utils/json.js";
import { AgentResponseSchema } from "./protocol.js";
import type { AgentResponse } from "./protocol.js";

export function parseAgentResponse(raw: string): AgentResponse {
  if (raw.length > AGENT.MAX_RESPONSE_CHARS) {
    throw new Error(`Agent response exceeded ${AGENT.MAX_RESPONSE_CHARS} characters.`);
  }

  const parsed = parseJson(raw);
  return AgentResponseSchema.parse(parsed);
}
