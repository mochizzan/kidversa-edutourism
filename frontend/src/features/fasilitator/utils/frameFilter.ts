import type { PhotoFrame } from '@/core/types'

/**
 * Ownership-aware frame filter for the frame picker.
 *
 * A frame may only be shown when it is active AND either belongs to the
 * given program or to "all programs". The DB stores the global convention
 * as an empty string ('') or NULL `program_id` — both count as global.
 *
 * With no program context (null/undefined/''), non-global frames are dropped
 * with a console warning so an unknown context never silently leaks frames
 * from other programs.
 */
export function filterFramesForProgram(
 frames: PhotoFrame[],
 programId: string | null | undefined,
): PhotoFrame[] {
 const active = frames.filter((f) => f.is_active)
 if (!programId) {
  console.warn('[FrameFilter] program context unknown; showing only global frames')
  return active.filter((f) => !f.program_id)
 }
 return active.filter((f) => !f.program_id || f.program_id === programId)
}
