import type { MissionBank, Assessment, SessionStage } from '../types/entities'

export interface MissionSelectorParams {
  participantId: string
  assessments: Assessment[]
  availableMissions: MissionBank[]
  sessionStages: SessionStage[]
}

export function selectMissionsForParticipant({
  assessments,
  availableMissions,
  sessionStages,
}: MissionSelectorParams): string[] {
  if (availableMissions.length === 0) return []

  const sessionToProgramStage = new Map<string, string>()
  sessionStages.forEach((ss) => {
    sessionToProgramStage.set(ss.id, ss.program_stage_id)
  })

  const programStageRatings = new Map<string, number[]>()
  assessments.forEach((assessment) => {
    if (!assessment.session_stage_id || assessment.star_rating == null) return
    const programStageId = sessionToProgramStage.get(assessment.session_stage_id)
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

  const byCategory = {
    HOME: availableMissions.filter((m) => m.category === 'HOME' && m.is_active),
    PARENT: availableMissions.filter((m) => m.category === 'PARENT' && m.is_active),
    SCHOOL: availableMissions.filter((m) => m.category === 'SCHOOL' && m.is_active),
  }

  const scoreMission = (mission: MissionBank): number => {
    if (!mission.related_stage_ids || mission.related_stage_ids.length === 0) return 0
    return mission.related_stage_ids.filter((sid) => lowestProgramStageIds.includes(sid)).length
  }

  const selected: string[] = []

  for (const category of ['HOME', 'PARENT', 'SCHOOL'] as const) {
    const missions = byCategory[category]
    if (missions.length === 0) continue

    const scored = missions
      .map((m) => ({ mission: m, score: scoreMission(m) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return a.mission.id.localeCompare(b.mission.id)
      })

    selected.push(scored[0].mission.id)
    if (selected.length >= 3) break
  }

  if (selected.length < 3) {
    const remaining = availableMissions
      .filter((m) => m.is_active && !selected.includes(m.id))
      .map((m) => ({ mission: m, score: scoreMission(m) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return a.mission.id.localeCompare(b.mission.id)
      })

    for (const { mission } of remaining) {
      selected.push(mission.id)
      if (selected.length >= 3) break
    }
  }

  return selected
}
