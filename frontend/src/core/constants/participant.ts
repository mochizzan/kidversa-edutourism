export const PARTICIPANT_AGE = {
  /** Batas keras — divalidasi FE & BE. */
  HARD_MIN: 1,
  HARD_MAX: 120,
  /** Di luar rentang ini form memunculkan modal konfirmasi. */
  SOFT_MIN: 4,
  SOFT_MAX: 17,
} as const

// Value pinned byte-exact by tests/unit/participantValidation.test.ts and id.json (validation.ageRange) — keep unchanged.
export const PARTICIPANT_AGE_ERROR = 'Usia anak harus 1–120 tahun'
