import { useState, useEffect, useCallback } from 'react'
import { sessionService } from '../../../core/services/sessions'
import { assessmentService } from '../../../core/services/assessments'
import { attendanceService } from '../../../core/services/attendance'
import { programService } from '../../../core/services/programs'
import { programSubstageService } from '../../../core/services/program-substages'
import { substagesOfStage } from '../../../core/utils/substage'
import { friendlyError } from '../../../core/utils/errorMessages'
import { useGroupOwnership } from './useGroupOwnership'
import type {
  Participant,
  SessionGroup,
  Assessment,
  SessionStage,
  ProgramStage,
  SessionSubstage,
} from '../../../core/types'

export interface ChildDetail {
  participant: Participant
  group: SessionGroup | undefined
  programStage?: ProgramStage
  sessionStage: SessionStage | undefined
  // Kegiatan (session_substage) leaves for the current session stage. The
  // assessment is scored per leaf, not per session stage.
  sessionSubstages: SessionSubstage[]
  // program_substage_id -> ProgramSubstage.name (the Kegiatan title).
  programSubstageNameMap: Record<string, string>
}

async function findChildInSessions(childId: string): Promise<{ detail: ChildDetail | null; sessionId?: string }> {
  const res = await sessionService.getAll({ limit: 100 })
  for (const session of res.data) {
    const detail = await sessionService.getById(session.id)
    if (!detail) continue

    const participant = detail.groups
      .flatMap((g) => g.participants)
      .find((p) => p.id === childId)
    if (!participant) continue

    const group = detail.groups.find((g) => g.participants.some((p) => p.id === childId))
    if (!group) continue

    let currentStage = detail.stages.find((s) => s.id === group.current_session_stage_id)

    if (!currentStage && detail.stages.length > 0) {
      currentStage =
        detail.stages.find((s) => s.status === 'ACTIVE') ?? detail.stages[0]
    }

    // Resolve Kegiatan leaves for the current session stage via the new
    // endpoint (no token mint needed).
    let sessionSubstages: SessionSubstage[] = []
    if (currentStage) {
      try {
        const all = await sessionService.getSubstages(session.id)
        sessionSubstages = substagesOfStage(all, currentStage.id)
      } catch {
        sessionSubstages = []
      }
    }

    const programStages = await programService.getStages(detail.program_id)
    const programStage = currentStage
      ? programStages.find((ps) => ps.id === currentStage.program_stage_id)
      : undefined

    // Map each Kegiatan leaf to its ProgramSubstage title for display.
    const programSubstageNameMap: Record<string, string> = {}
    const substageIds = Array.from(
      new Set(sessionSubstages.map((s) => s.program_substage_id)),
    )
    if (substageIds.length > 0) {
      try {
        const substagePromises = programStages.map((ps) =>
          programSubstageService.listByStage(ps.id),
        )
        const allSubs = (await Promise.all(substagePromises)).flat()
        for (const sub of allSubs) {
          programSubstageNameMap[sub.id] = sub.name
        }
      } catch {
        // Leave the map empty; the page falls back to the Kegiatan index.
      }
    }

    return {
      detail: {
        participant,
        group,
        programStage,
        sessionStage: currentStage,
        sessionSubstages,
        programSubstageNameMap,
      },
      sessionId: session.id,
    }
  }
  return { detail: null }
}

export function useChildAssessment(childId: string | undefined) {
  const { isMine } = useGroupOwnership(childId)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [childDetail, setChildDetail] = useState<ChildDetail | null>(null)
  const [assessmentMap, setAssessmentMap] = useState<Map<string, Assessment>>(new Map())
  const [isPresent, setIsPresent] = useState(false)

  const fetchAssessments = useCallback(async () => {
    if (!childId) return
    try {
      const assessments = await assessmentService.getByParticipant(childId)
      const map = new Map<string, Assessment>()
      for (const a of assessments) {
        map.set(a.session_substage_id, a)
      }
      setAssessmentMap(map)
    } catch {
      // Non-fatal: leave map empty
    }
  }, [childId])

  const fetchData = useCallback(async () => {
    if (!childId) return
    try {
      setLoading(true)
      setError(null)

      const { detail, sessionId } = await findChildInSessions(childId)
      if (!detail) {
        setError('Data anak tidak ditemukan')
        return
      }
      setChildDetail(detail)

      // Fetch attendance for this child
      if (sessionId) {
        try {
          const attRes = await attendanceService.getBySession(sessionId)
          const att = attRes.find(a => a.participant_id === childId)
          setIsPresent(att?.is_present ?? false)
        } catch {
          setIsPresent(false)
        }
      }

      // Fetch all assessments at once for all kegiatan cards
      if (detail.sessionSubstages.length > 0) {
        await fetchAssessments()
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }, [childId, fetchAssessments])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const refreshAssessments = useCallback(async () => {
    await fetchAssessments()
  }, [fetchAssessments])

  return {
    loading,
    error,
    childDetail,
    assessmentMap,
    refreshAssessments,
    isMine,
    fetchData,
    isPresent,
  }
}
