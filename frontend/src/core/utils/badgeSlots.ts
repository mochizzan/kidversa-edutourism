/** Item badge untuk split slot mini rapor (kontrak Fase 2 D2).
 *  Menerima row mentah (ParticipantBadge / PublicReportBadge) yang sudah
 *  di-map ke camelCase — field pemisah `badge_type`/`program_stage_id` boleh
 *  undefined/null pada data legacy. */
export interface SplitBadge {
 badgeName: string
 badgeImageUrl?: string
 badge_type?: string | null
 program_stage_id?: string | null
}

/** Hasil split: slot kiri = badge topik, slot kanan = badge final (0..1). */
export interface BadgeSlots {
 topicBadges: SplitBadge[]
 finalBadge?: SplitBadge
}

const hasValue = (v?: string | null): v is string => typeof v === 'string' && v.trim() !== ''

/**
 * Split daftar badge campur (SUBTOPIK + FINAL) menjadi dua slot mini rapor
 * (kontrak Fase 2 D2):
 *
 * - `topicBadges` = badge_type `SUBTOPIK` yang `program_stage_id`-nya sama
 *   dengan `programStageId` yang sedang direview; `programStageId` kosong
 *   (report legacy) → SEMUA SUBTOPIK (kompat mundur).
 * - `finalBadge` = item `badge_type` `FINAL` PERTAMA (0..1).
 * - Fallback toleran untuk data lama (field hilang): type undefined/kosong +
 *   punya `program_stage_id` → diperlakukan SUBTOPIK; type undefined/kosong +
 *   tanpa `program_stage_id` (null/''/undefined) → diperlakukan FINAL.
 */
export function splitBadgeSlots(
 badges: SplitBadge[] | null | undefined,
 programStageId?: string | null,
): BadgeSlots {
 const list = badges ?? []
 const stageKey = hasValue(programStageId) ? programStageId.trim() : ''
 const isLegacy = stageKey === ''

 const topicBadges: SplitBadge[] = []
 let finalBadge: SplitBadge | undefined

 for (const badge of list) {
  const type = hasValue(badge.badge_type) ? badge.badge_type.trim().toUpperCase() : ''
  const badgeStage = hasValue(badge.program_stage_id) ? badge.program_stage_id.trim() : ''

  if (type === 'FINAL') {
   if (!finalBadge) finalBadge = badge
   continue
  }

  // SUBTOPIK eksplisit; selain itu (type hilang/ tak dikenal) fallback: row
  // membawa stage id → diperlakukan SUBTOPIK.
  const isTopic = type === 'SUBTOPIK' || badgeStage !== ''
  if (isTopic) {
   // Report legacy (tanpa stage key) → semua topik masuk slot kiri.
   if (isLegacy || badgeStage === stageKey) topicBadges.push(badge)
   continue
  }

  // Type FINAL hilang/kosong dan tanpa stage id → diperlakukan FINAL
  // (jaring pengaman; tetap 0..1 — ambil yang pertama).
  if (!finalBadge) finalBadge = badge
 }

 return { topicBadges, finalBadge }
}
