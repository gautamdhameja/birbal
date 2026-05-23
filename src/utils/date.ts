const DATE_ONLY_PATTERN = /(\d{4}-\d{2}-\d{2})/;
const DATE_LENGTH = 10;

export function formatDateOnly(value: Date | string | null | undefined, fallback: string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, DATE_LENGTH);
  }

  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }

  const dateOnly = DATE_ONLY_PATTERN.exec(normalized)?.[1];
  if (dateOnly) {
    return dateOnly;
  }

  const timestamp = Date.parse(normalized);
  if (Number.isNaN(timestamp)) {
    return fallback;
  }

  return new Date(timestamp).toISOString().slice(0, DATE_LENGTH);
}
