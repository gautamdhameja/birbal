// Purpose: Collects shared llama constants.
// Scope: Avoids scattering repeated literals across runtime modules.

export const LLAMA = {
  DEFAULT_REQUEST_TIMEOUT_MS: 120_000,
  RESPONSE_FORMATS: {
    JSON_OBJECT: "json_object",
  },
} as const;
