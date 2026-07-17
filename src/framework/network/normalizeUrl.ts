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
