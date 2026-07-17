// Purpose: Collects shared time constants.
// Scope: Avoids scattering repeated literals across runtime modules.

export const TIME = {
  DEFAULT_PAD_LENGTH: 2,
  MILLISECOND_PAD_LENGTH: 3,
  MINUTES_PER_HOUR: 60,
  POSITIVE_OFFSET_SIGN: "+",
  NEGATIVE_OFFSET_SIGN: "-",
  DATE_TIME_SEPARATOR: "T",
} as const;
