import { AgentResponseSchema } from "../agent/protocol.js";
import type { AgentResponse } from "../agent/protocol.js";

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = inString;
      continue;
    }

    if (character === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const extracted = extractFirstJsonObject(raw);
    if (!extracted) {
      throw new Error("Agent response is not valid JSON and no JSON object could be extracted.");
    }

    try {
      return JSON.parse(extracted);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Extracted agent response JSON is invalid: ${message}`);
    }
  }
}

export function parseAgentResponse(raw: string): AgentResponse {
  const parsed = parseJson(raw);
  return AgentResponseSchema.parse(parsed);
}
