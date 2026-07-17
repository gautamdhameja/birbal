export const SOURCE_REGISTRY = {
  DIRECTORY: "config",
  FILE_NAME: "source-registry.json",
  SOURCE_TYPES: {
    COMMUNITY: "community",
    ACADEMIC_FALLBACK: "academic_fallback",
    VENDOR: "vendor",
    CONSULTING: "consulting",
    BUSINESS_PRESS: "business_press",
  },
  ERRORS: {
    INVALID_JSON: "Source registry config is not valid JSON.",
    INVALID_CONFIG: "Source registry config is invalid.",
  },
} as const;
