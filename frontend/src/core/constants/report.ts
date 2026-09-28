// 210mm @96dpi = 793,70px, dibulatkan 794 — HANYA untuk tempat yang
// mensyaratkan piksel (lebar iframe tersembunyi & input html2canvas/jsPDF).
// Lembar rapor sendiri (layar & cetak) memakai mm (210mm × 297mm) —
// lihat .a4-sheet di shared/templates/miniRaport.tailwind.css.
export const A4_SHEET_WIDTH = 794

export const DEFAULT_FACILITATOR_MESSAGE =
  'Terima kasih telah berpartisipasi dalam Program Kidversa Edu-Tourism. Semoga pengalaman belajar hari ini memberikan inspirasi dan kebahagiaan bagi si kecil. Sampai jumpa di sesi berikutnya!'

export const DEFAULT_FACILITATOR_NAME = 'Fasilitator Kidversa'

// Raport (report card) layout caps — shared so the print/PDF/HTML renderers
// stay consistent across the mini-raport template and the review hook.
export const RAPORT_LAYOUT = {
  /** Max number of detail (expanded) stages shown before collapsing the rest. */
  MAX_DETAIL_STAGES: 4,
  /** Max missions / badges previewed in the raport. */
  MAX_MISSIONS_PREVIEW: 4,
  MAX_BADGES_PREVIEW: 4,
} as const
