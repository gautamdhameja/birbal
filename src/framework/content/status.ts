// Purpose: Defines shared content fetch status values for framework and app code.
// Scope: Keeps fetched-content state consistent across fetchers, candidates, and storage.

export const CONTENT_FETCH_STATUSES = {
  NOT_FETCHED: "not_fetched",
  FETCHED: "fetched",
  FAILED: "failed",
  PAYWALLED: "paywalled",
} as const;

export type ContentFetchStatus =
  (typeof CONTENT_FETCH_STATUSES)[keyof typeof CONTENT_FETCH_STATUSES];
