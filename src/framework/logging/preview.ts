// Purpose: Implements the framework's structured logging preview helper.
// Scope: Redacts and truncates values without depending on application logging configuration.

const DEFAULT_PREVIEW_MAX_LENGTH = 500;

const REDACTED_VALUE = "[redacted]";
const REDACTED_KEYS = new Set([
  "contentText",
  "invalidOutput",
  "plainText",
  "raw",
  "rawJson",
  "repairedOutput",
]);

export function preview(value: unknown, maxLength: number = DEFAULT_PREVIEW_MAX_LENGTH): string {
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
