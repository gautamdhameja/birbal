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

    if (character === "\\") {
      escapedJson += character;
      escaped = inString;
      continue;
    }

    if (character === '"') {
      escapedJson += character;
      inString = !inString;
      continue;
    }

    if (inString) {
      if (character === "\n") {
        escapedJson += "\\n";
        continue;
      }

      if (character === "\r") {
        escapedJson += "\\r";
        continue;
      }

      if (character === "\t") {
        escapedJson += "\\t";
        continue;
      }

      if (character.charCodeAt(0) < 0x20) {
        escapedJson += `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
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

export function parseStrictJson(raw: string): unknown {
  return parseJsonCandidate(raw);
}
