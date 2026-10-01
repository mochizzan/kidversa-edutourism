/**
 * Pure group-completion rule (attendance-aware grading gate).
 *
 *   canComplete = everyExplicitlyPresentParticipantIsFullyAssessed
 *
 * - marked    = the attendance map has an explicit row for the participant
 * - present   = that row says is_present === true → MUST be fully assessed,
 *               a present-but-unassessed participant BLOCKS completion
 * - absent    = that row says is_present === false → exempt, never blocks
 * - unmarked  = no row at all (belum absen) → exempt: NOT required to be
 *               assessed and must NOT block completion
 * - fully assessed = every active Kegiatan leaf scored >= 1 (leaf scoring
 *               WITHOUT any presence check — presence is handled separately)
 *
 * Edge: zero present participants (everyone absent/unmarked) → the
 * present-side condition is vacuously true → CAN complete.
 */
export interface GroupCompletionInput {
 /** Participant ids of the group. */
 participantIds: readonly string[]
 /**
  * Explicit attendance rows only: `has(id)` = marked, `get(id)` = is_present.
  */
 attendance: ReadonlyMap<string, boolean>
 /** Leaf-scoring check with NO presence gate. */
 isFullyAssessed: (participantId: string) => boolean
}

export interface GroupCompletionState {
 /** The attendance-aware completion rule above. */
 canComplete: boolean
 /** Participants without an attendance row (belum absen) — exempt, non-blocking. */
 unmarkedCount: number
 /** Participants explicitly marked present. */
 presentCount: number
 /** Present participants that are fully assessed. */
 assessedPresentCount: number
 /**
  * Participants still blocking completion: present-but-not-fully assessed.
  * Absent and unmarked participants contribute 0.
  */
 remainingCount: number
}

export function evaluateGroupCompletion({
 participantIds,
 attendance,
 isFullyAssessed,
}: GroupCompletionInput): GroupCompletionState {
 let unmarkedCount = 0
 let presentCount = 0
 let assessedPresentCount = 0

 for (const id of participantIds) {
  if (!attendance.has(id)) {
   // Unmarked (belum absen): exempt — not required to be assessed, does NOT block.
   unmarkedCount++
   continue
  }
  if (attendance.get(id) !== true) continue // explicit absent → never blocks
  presentCount++
  if (isFullyAssessed(id)) assessedPresentCount++
 }

 const remainingCount = presentCount - assessedPresentCount
 return {
  canComplete: assessedPresentCount === presentCount,
  unmarkedCount,
  presentCount,
  assessedPresentCount,
  remainingCount,
 }
}
