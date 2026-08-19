import type { SessionSubstage } from '../types'

const byOrder = (a: SessionSubstage, b: SessionSubstage): number => {
  const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  return t !== 0 ? t : a.id.localeCompare(b.id)
}

/** Parent SubTopik (session_stages.id) of the given Kegiatan (session_substages.id). */
export function parentStageId(substages: SessionSubstage[], substageId?: string): string | undefined {
  return substages.find((s) => s.id === substageId)?.session_stage_id
}

/** All Kegiatan sharing the parent SubTopik of the given Kegiatan, ordered by created_at then id. */
export function siblingSubstages(substages: SessionSubstage[], substageId?: string): SessionSubstage[] {
  const parentId = parentStageId(substages, substageId)
  return substagesOfStage(substages, parentId)
}

/** All Kegiatan whose parent SubTopik is the given session_stages.id, ordered by created_at then id. */
export function substagesOfStage(substages: SessionSubstage[], sessionStageId?: string): SessionSubstage[] {
  if (!sessionStageId) return []
  // filter() already returns a fresh array, so sorting it in place is safe.
  return substages.filter((s) => s.session_stage_id === sessionStageId).sort(byOrder)
}
