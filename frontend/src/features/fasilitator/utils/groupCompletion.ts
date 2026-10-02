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

/**
 * Per-topic completed state derived from SERVER group_stage_progress rows
 * (`liveService.getGroupsWithProgress(...).groups[].progress[]`, already
 * scoped to the group by the caller).
 *
 * A topic (session stage) is completed when EVERY Kegiatan leaf of the topic
 * has a terminal row (COMPLETED or SKIPPED) for the group:
 * - missing row for any leaf → NOT completed (rows are seeded LOCKED at
 *   session start, so a missing row means the leaf was never processed);
 * - empty leaf list → NOT completed: there is nothing to derive from, so the
 *   caller stays driven by the attendance/assessment rule instead.
 *
 * Pure and refresh-safe: the input comes from a fresh fetchData on mount, so
 * the derived state survives a page reload (no local-memory dependency).
 */
export interface TopicProgressRow {
 session_substage_id: string
 status: string
}

export function isTopicCompletedFromProgress(
 rows: readonly TopicProgressRow[],
 leaves: readonly { id: string }[],
): boolean {
 if (leaves.length === 0) return false
 return leaves.every((leaf) =>
  rows.some(
   (row) =>
    row.session_substage_id === leaf.id &&
    (row.status === 'COMPLETED' || row.status === 'SKIPPED'),
  ),
 )
}

/**
 * Per-Kegiatan terminal state from the same SERVER group_stage_progress rows
 * (Perbaikan-1).
 *
 * A single Kegiatan leaf is done when it has a terminal row (COMPLETED or
 * SKIPPED) for the group; a missing row means NOT done. Used by
 * ChildAssessmentPage to lock each KegiatanCard individually
 * (`locked = isGroupCompleted || isKegiatanCompletedFromProgress(...)`) so a
 * completed topik-1 Kegiatan stays read-only while topik-2 stays editable.
 * Pure and refresh-safe like isTopicCompletedFromProgress above.
 */
export function isKegiatanCompletedFromProgress(
 rows: readonly TopicProgressRow[],
 leafId: string,
): boolean {
 return rows.some(
  (row) =>
   row.session_substage_id === leafId &&
   (row.status === 'COMPLETED' || row.status === 'SKIPPED'),
 )
}
