import type { MissionBank, Assessment } from '../types/entities'

export interface MissionSelectorParams {
 assessments: Assessment[]
 availableMissions: MissionBank[]
 /** Session Kegiatan paired with the Topik (program stage) they belong to.
  *  Assessments key on session_substage_id, so this is the bridge from a
  *  Kegiatan to its Topik. session_stages.id is a DIFFERENT id space and must
  *  never be used as this key — the old lookup never matched, every rating was
  *  skipped, and all scores collapsed to 0 (so the tie-break by id took over). */
 substages: { id: string; program_stage_id: string }[]
}

export function selectMissionsForParticipant({
 assessments,
 availableMissions,
 substages,
}: MissionSelectorParams): string[] {
 if (availableMissions.length === 0) return []

 const substageToProgramStage = new Map<string, string>()
 substages.forEach((ss) => {
  substageToProgramStage.set(ss.id, ss.program_stage_id)
 })

 const programStageRatings = new Map<string, number[]>()
 assessments.forEach((assessment) => {
  if (!assessment.session_substage_id || assessment.star_rating == null) return
  const programStageId = substageToProgramStage.get(assessment.session_substage_id)
  if (!programStageId) return
  if (!programStageRatings.has(programStageId)) {
   programStageRatings.set(programStageId, [])
  }
  programStageRatings.get(programStageId)!.push(assessment.star_rating)
 })

 const stageAvgRatings = new Map<string, number>()
 programStageRatings.forEach((ratings, stageId) => {
  const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length
  stageAvgRatings.set(stageId, avg)
 })

 const sortedStages = Array.from(stageAvgRatings.entries())
  .sort((a, b) => a[1] - b[1])
  .map(([stageId]) => stageId)

 const lowestProgramStageIds = sortedStages.slice(0, 2)

 const scoreMission = (mission: MissionBank): number => {
  if (!mission.related_stage_ids || mission.related_stage_ids.length === 0) return 0
  return mission.related_stage_ids.filter((sid) => lowestProgramStageIds.includes(sid)).length
 }

 const active = availableMissions.filter((m) => m.is_active)

 const scored = active
  .map((m) => ({ mission: m, score: scoreMission(m) }))
  .sort((a, b) => {
   if (b.score !== a.score) return b.score - a.score
   return a.mission.id.localeCompare(b.mission.id)
  })

 const selected: string[] = []
 for (const { mission } of scored) {
  selected.push(mission.id)
  if (selected.length >= 3) break
 }

 return selected
}
