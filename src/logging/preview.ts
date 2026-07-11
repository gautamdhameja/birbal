// Purpose: Implements the structured logging helper: preview.
// Scope: Keeps runtime trace output consistent and concise.

import { LOGGING } from "../constants/runtime.js";

const REDACTED_VALUE = "[redacted]";
const REDACTED_KEYS = new Set([
  "contentText",
  "invalidOutput",
  "plainText",
  "raw",
  "rawJson",
  "repairedOutput",
]);

export function preview(value: unknown, maxLength: number = LOGGING.PREVIEW_MAX_LENGTH): string {
  const rendered =
    typeof value === "string"
      ? value
      : JSON.stringify(value, (key, nestedValue: unknown) =>
          REDACTED_KEYS.has(key) ? REDACTED_VALUE : nestedValue,
        );
  if (!rendered) {
    return "";
  }

  return rendered.length > maxLength ? `${rendered.slice(0, maxLength)}...` : rendered;
}
