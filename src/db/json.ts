// Purpose: Decodes JSON values read from persistent storage.
// Scope: Centralizes malformed-row fallback behavior for database adapters.

export function decodePersistedJson(value: string, fallback: unknown): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
