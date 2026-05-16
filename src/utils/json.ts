import { AgentResponseSchema } from "../agent/protocol.js";
import type { AgentResponse } from "../agent/protocol.js";

function extractBalancedJsonObject(raw: string, start: number): string | null {
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

function* extractJsonObjectCandidates(raw: string): Generator<string> {
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] !== "{") {
      continue;
    }

    const extracted = extractBalancedJsonObject(raw, index);
    if (extracted) {
      yield extracted;
    }
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    let lastErrorMessage: string | null = null;

    for (const extracted of extractJsonObjectCandidates(raw)) {
      try {
        return JSON.parse(extracted);
      } catch (error) {
        lastErrorMessage = error instanceof Error ? error.message : String(error);
      }
    }

    if (lastErrorMessage) {
      throw new Error(`No extracted agent response JSON object was valid: ${lastErrorMessage}`);
    }

    throw new Error("Agent response is not valid JSON and no JSON object could be extracted.");
  }
}

export function parseAgentResponse(raw: string): AgentResponse {
  const parsed = parseJson(raw);
  return AgentResponseSchema.parse(parsed);
}
