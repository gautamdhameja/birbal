import { parseJson } from "../utils/json.js";
import { AgentResponseSchema } from "./protocol.js";
import type { AgentResponse } from "./protocol.js";

export function parseAgentResponse(raw: string): AgentResponse {
  const parsed = parseJson(raw);
  return AgentResponseSchema.parse(parsed);
}
