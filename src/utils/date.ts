// Purpose: Implements the small shared utility: date.
// Scope: Holds narrow helpers used across runtime modules.

const DATE_ONLY_PATTERN = /(\d{4}-\d{2}-\d{2})/;
const DATE_LENGTH = 10;
const DATE_PART_TYPES = {
  DAY: "day",
  MONTH: "month",
  YEAR: "year",
} as const;

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

export function formatDateOnlyInTimeZone(date: Date, timeZone?: string): string {
  if (!timeZone) {
    return date.toISOString().slice(0, DATE_LENGTH);
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const partValue = (type: string): string => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) {
      throw new Error(`Could not format date part: ${type}`);
    }

    return value;
  };

  return [
    partValue(DATE_PART_TYPES.YEAR),
    partValue(DATE_PART_TYPES.MONTH),
    partValue(DATE_PART_TYPES.DAY),
  ].join("-");
}
