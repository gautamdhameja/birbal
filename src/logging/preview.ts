import { LOGGING } from "../constants/runtime.js";

export function preview(value: unknown, maxLength = LOGGING.PREVIEW_MAX_LENGTH): string {
  const rendered = typeof value === "string" ? value : JSON.stringify(value);
  if (!rendered) {
    return "";
  }

  return rendered.length > maxLength ? `${rendered.slice(0, maxLength)}...` : rendered;
}
