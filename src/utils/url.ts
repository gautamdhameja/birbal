// Purpose: Implements the small shared utility: url.
// Scope: Holds narrow helpers used across runtime modules.

import normalizeUrlPackage from "normalize-url";

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();

  try {
    return normalizeUrlPackage(trimmed, {
      normalizeProtocol: false,
      removeQueryParameters: false,
      removeSingleSlash: false,
      removeTrailingSlash: false,
      stripHash: true,
      stripWWW: false,
    });
  } catch {
    return trimmed;
  }
}
