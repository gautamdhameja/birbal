const DATE_ONLY_PATTERN = /(\d{4}-\d{2}-\d{2})/;
const DATE_LENGTH = 10;
const DATE_PART_TYPES = {
  DAY: "day",
  HOUR: "hour",
  MINUTE: "minute",
  MONTH: "month",
  SECOND: "second",
  YEAR: "year",
} as const;

function partValue(
  parts: readonly Intl.DateTimeFormatPart[],
  type: string,
  valueKind: "date" | "time",
): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) {
    throw new Error(`Could not format ${valueKind} part: ${type}`);
  }

  return value;
}

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
  return [
    partValue(parts, DATE_PART_TYPES.YEAR, "date"),
    partValue(parts, DATE_PART_TYPES.MONTH, "date"),
    partValue(parts, DATE_PART_TYPES.DAY, "date"),
  ].join("-");
}

export function formatTimeOnlyInTimeZone(date: Date, timeZone?: string): string {
  if (!timeZone) {
    return date.toISOString().slice(11, 19).replaceAll(":", "");
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
    timeZone,
  }).formatToParts(date);
  return [
    partValue(parts, DATE_PART_TYPES.HOUR, "time"),
    partValue(parts, DATE_PART_TYPES.MINUTE, "time"),
    partValue(parts, DATE_PART_TYPES.SECOND, "time"),
  ].join("");
}
