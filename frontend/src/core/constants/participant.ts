export const PARTICIPANT_AGE = {
  /** Batas keras — divalidasi FE & BE. */
  HARD_MIN: 1,
  HARD_MAX: 120,
  /** Di luar rentang ini form memunculkan modal konfirmasi. */
  SOFT_MIN: 4,
  SOFT_MAX: 17,
} as const

export const PARTICIPANT_AGE_ERROR = 'Usia anak harus 1–120 tahun'
