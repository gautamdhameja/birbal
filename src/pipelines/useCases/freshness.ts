// Purpose: Applies freshness rules for enterprise use-case newsletter candidates.
// Scope: Keeps date-window checks shared across search results and extracted use cases.

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function timestampFromDate(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function isWithinAgeWindow({
  maxAgeDays,
  publishedAt,
  referenceDate,
}: {
  maxAgeDays?: number;
  publishedAt: string;
  referenceDate: Date;
}): boolean {
  if (maxAgeDays === undefined) {
    return true;
  }

  if (!Number.isInteger(maxAgeDays) || maxAgeDays < 0) {
    throw new Error("maxAgeDays must be a non-negative integer.");
  }

  const publishedTimestamp = timestampFromDate(publishedAt);
  if (publishedTimestamp === null) {
    return false;
  }

  const cutoffTimestamp = startOfUtcDay(referenceDate) - maxAgeDays * MILLISECONDS_PER_DAY;
  return publishedTimestamp >= cutoffTimestamp;
}
