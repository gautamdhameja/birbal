// Purpose: Collects shared json constants.
// Scope: Avoids scattering repeated literals across runtime modules.

export const JSON_PARSING = {
  CHARS: {
    BACKSLASH: "\\",
    QUOTE: '"',
    OPEN_BRACE: "{",
    CLOSE_BRACE: "}",
    NEWLINE: "\n",
    CARRIAGE_RETURN: "\r",
    TAB: "\t",
  },
  ESCAPES: {
    NEWLINE: "\\n",
    CARRIAGE_RETURN: "\\r",
    TAB: "\\t",
    UNICODE_PREFIX: "\\u",
  },
  CONTROL_CHAR_CODE_LIMIT: 0x20,
  UNICODE_RADIX: 16,
  UNICODE_PAD_LENGTH: 4,
  ERRORS: {
    INVALID_EXTRACTED_JSON_PREFIX: "No extracted agent response JSON object was valid:",
    NO_JSON_OBJECT: "Agent response is not valid JSON and no JSON object could be extracted.",
  },
} as const;
