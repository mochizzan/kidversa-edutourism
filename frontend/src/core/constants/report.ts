export const A4_SHEET_WIDTH = 794 // px — A4 at 96dpi

export const DEFAULT_FACILITATOR_MESSAGE =
  'Terima kasih telah berpartisipasi dalam Program Kidversa Edu-Tourism. Semoga pengalaman belajar hari ini memberikan inspirasi dan kebahagiaan bagi si kecil. Sampai jumpa di sesi berikutnya!'

export const DEFAULT_FACILITATOR_NAME = 'Fasilitator Kidversa'

// Raport (report card) layout caps — shared so the print/PDF/HTML renderers
// stay consistent across the mini-raport template and the review hook.
export const RAPORT_LAYOUT = {
  /** Max number of detail (expanded) stages shown before collapsing the rest. */
  MAX_DETAIL_STAGES: 4,
  /** Max kegiatan (activities) shown per stage in the raport. */
  MAX_KEGIATAN_PER_STAGE: 3,
  /** Max characters of narrative text before truncation with an ellipsis. */
  MAX_NARRATIVE_CHARS: 260,
  /** Max missions / badges previewed in the raport. */
  MAX_MISSIONS_PREVIEW: 4,
  MAX_BADGES_PREVIEW: 4,
} as const
