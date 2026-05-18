import { AgentResponseSchema } from "../agent/protocol.js";
import type { AgentResponse } from "../agent/protocol.js";
import { JSON_PARSING } from "../constants.js";

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

    if (character === JSON_PARSING.CHARS.BACKSLASH) {
      escaped = inString;
      continue;
    }

    if (character === JSON_PARSING.CHARS.QUOTE) {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === JSON_PARSING.CHARS.OPEN_BRACE) {
      depth += 1;
      continue;
    }

    if (character === JSON_PARSING.CHARS.CLOSE_BRACE) {
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
    if (raw[index] !== JSON_PARSING.CHARS.OPEN_BRACE) {
      continue;
    }

    const extracted = extractBalancedJsonObject(raw, index);
    if (extracted) {
      yield extracted;
    }
  }
}

function escapeControlCharactersInJsonStrings(raw: string): string {
  let escapedJson = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index] ?? "";

    if (escaped) {
      escapedJson += character;
      escaped = false;
      continue;
    }

    if (character === JSON_PARSING.CHARS.BACKSLASH) {
      escapedJson += character;
      escaped = inString;
      continue;
    }

    if (character === JSON_PARSING.CHARS.QUOTE) {
      escapedJson += character;
      inString = !inString;
      continue;
    }

    if (inString) {
      if (character === JSON_PARSING.CHARS.NEWLINE) {
        escapedJson += JSON_PARSING.ESCAPES.NEWLINE;
        continue;
      }

      if (character === JSON_PARSING.CHARS.CARRIAGE_RETURN) {
        escapedJson += JSON_PARSING.ESCAPES.CARRIAGE_RETURN;
        continue;
      }

      if (character === JSON_PARSING.CHARS.TAB) {
        escapedJson += JSON_PARSING.ESCAPES.TAB;
        continue;
      }

      if (character.charCodeAt(0) < JSON_PARSING.CONTROL_CHAR_CODE_LIMIT) {
        escapedJson += `${JSON_PARSING.ESCAPES.UNICODE_PREFIX}${character
          .charCodeAt(0)
          .toString(JSON_PARSING.UNICODE_RADIX)
          .padStart(JSON_PARSING.UNICODE_PAD_LENGTH, "0")}`;
        continue;
      }
    }

    escapedJson += character;
  }

  return escapedJson;
}

function parseJsonCandidate(candidate: string): unknown {
  try {
    return JSON.parse(candidate);
  } catch {
    return JSON.parse(escapeControlCharactersInJsonStrings(candidate));
  }
}

function parseJson(raw: string): unknown {
  try {
    return parseJsonCandidate(raw);
  } catch {
    let lastErrorMessage: string | null = null;

    for (const extracted of extractJsonObjectCandidates(raw)) {
      try {
        return parseJsonCandidate(extracted);
      } catch (error) {
        lastErrorMessage = error instanceof Error ? error.message : String(error);
      }
    }

    if (lastErrorMessage) {
      throw new Error(`${JSON_PARSING.ERRORS.INVALID_EXTRACTED_JSON_PREFIX} ${lastErrorMessage}`);
    }

    throw new Error(JSON_PARSING.ERRORS.NO_JSON_OBJECT);
  }
}

export function parseAgentResponse(raw: string): AgentResponse {
  const parsed = parseJson(raw);
  return AgentResponseSchema.parse(parsed);
}
