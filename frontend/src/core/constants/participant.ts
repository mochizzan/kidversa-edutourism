// participant.ts — single source of truth for participant form rules.
// The backend only enforces `child_age >= 0`; the 4–10 window is a product
// rule enforced on the frontend, so it must live here rather than as literals
// duplicated across ParticipantFormPage and ParticipantFormModal.
export const PARTICIPANT_AGE = {
  MIN: 4,
  MAX: 10,
  DEFAULT: 6,
} as const

export const PARTICIPANT_AGE_ERROR =
  `Usia anak harus antara ${PARTICIPANT_AGE.MIN}-${PARTICIPANT_AGE.MAX} tahun`
