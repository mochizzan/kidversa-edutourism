import { useState, useEffect, useCallback } from 'react'
import { i18n } from '../../../core/i18n'
import { sessionService } from '../../../core/services/sessions'
import { assessmentService } from '../../../core/services/assessments'
import { attendanceService } from '../../../core/services/attendance'
import { liveService, type GroupStageProgressRow } from '../../../core/services/live'
import { programService } from '../../../core/services/programs'
import { programSubstageService } from '../../../core/services/program-substages'
import { substagesOfStage } from '../../../core/utils/substage'
import { friendlyError } from '../../../core/utils/errorMessages'
import { useGroupOwnership } from './useGroupOwnership'
import type {
  Participant,
  Session,
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
  session: Session
  sessionStage: SessionStage | undefined
  // Kegiatan (session_substage) leaves for the ACTIVE session stage (Perbaikan-1:
  // resolved from the forwarded stageId — the `sessionStageId` navigate state /
  // `?stage=` query — never from group.current_session_stage_id). The
  // assessment is scored per leaf, not per session stage.
  sessionSubstages: SessionSubstage[]
  // program_substage_id -> ProgramSubstage.name (the Kegiatan title).
  programSubstageNameMap: Record<string, string>
  // Server group_stage_progress rows for THIS group (Perbaikan-1): drives the
  // per-Kegiatan lock (locked = group COMPLETED || leaf terminal row).
  groupProgressRows: GroupStageProgressRow[]
}

// Resolve the active stage: an explicit forwarded stageId wins when it names
// a stage of THIS session; otherwise fall back to the historical chain
// (group.current_session_stage_id → ACTIVE → first). Unknown ids fall back
// loudly (warn), never to empty — the caller always gets a usable stage when
// the session has any.
function resolveActiveStage(
  stages: SessionStage[],
  group: SessionGroup,
  preferredStageId?: string,
): SessionStage | undefined {
  if (preferredStageId) {
    const match = stages.find((s) => s.id === preferredStageId)
    if (match) return match
    console.warn('[useChildAssessment] unknown stage hint; using resolved stage', preferredStageId)
  }
  const byGroup = stages.find((s) => s.id === group.current_session_stage_id)
  if (byGroup) return byGroup
  if (stages.length === 0) return undefined
  return stages.find((s) => s.status === 'ACTIVE') ?? stages[0]
}

async function buildDetail(
  sessionDetail: Session & { stages: SessionStage[]; groups: (SessionGroup & { participants: Participant[] })[] },
  childId: string,
  preferredStageId?: string,
): Promise<ChildDetail | null> {
  const participant = sessionDetail.groups
    .flatMap((g) => g.participants)
    .find((p) => p.id === childId)
  const group = sessionDetail.groups.find((g) => g.participants.some((p) => p.id === childId))
  if (!participant || !group) return null

  const currentStage = resolveActiveStage(sessionDetail.stages, group, preferredStageId)

  // Resolve Kegiatan leaves for the ACTIVE session stage via the new
  // endpoint (no token mint needed).
  let sessionSubstages: SessionSubstage[] = []
  if (currentStage) {
    try {
      const all = await sessionService.getSubstages(sessionDetail.id)
      sessionSubstages = substagesOfStage(all, currentStage.id)
    } catch (error) {
      console.error('[useChildAssessment] getSubstages failed; kegiatan list falls back to empty', error)
      sessionSubstages = []
    }
  }

  const programStages = await programService.getStages(sessionDetail.program_id)
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
    } catch (error) {
      // Leave the map empty; the page falls back to the Kegiatan index.
      console.error('[useChildAssessment] kegiatan titles lookup failed', error)
    }
  }

  // Server progress rows for THIS group — source of truth for the per-Kegiatan
  // lock. Fetched LAZILY (fire-and-forget merge in fetchData, never awaited
  // here): a slow/failing progress endpoint must never delay the
  // leaves/scores render — the lock degrades to group-status-only until the
  // rows arrive, and the server-side group_completed guard stays authoritative.
  const groupProgressRows: GroupStageProgressRow[] = []

  return {
    participant,
    group,
    programStage,
    session: sessionDetail,
    sessionStage: currentStage,
    sessionSubstages,
    programSubstageNameMap,
    groupProgressRows,
  }
}

// Merge the server progress rows into an already-rendered detail. Fire-and-
// forget from fetchData: resolves fast on mocked/healthy backends, never
// blocks the first paint on a slow one.
async function fetchGroupProgress(
  sessionDetailId: string,
  groupId: string | undefined,
): Promise<GroupStageProgressRow[]> {
  if (!groupId) return []
  try {
    const groupsData = await liveService.getGroupsWithProgress(sessionDetailId)
    return groupsData.find((g) => g.group.id === groupId)?.progress ?? []
  } catch (error) {
    console.error('[useChildAssessment] group progress fetch failed', error)
    return []
  }
}

async function findChildInSessions(
  childId: string,
  preferredStageId?: string,
): Promise<{ detail: ChildDetail | null; sessionId?: string }> {
  const res = await sessionService.getAll({ limit: 100 })
  for (const session of res.data) {
    const detail = await sessionService.getById(session.id)
    if (!detail) continue

    const found = detail.groups
      .flatMap((g) => g.participants)
      .find((p) => p.id === childId)
    if (!found) continue

    const built = await buildDetail(detail, childId, preferredStageId)
    if (!built) continue
    return { detail: built, sessionId: session.id }
  }
  return { detail: null }
}

export function useChildAssessment(childId: string | undefined, sessionId?: string, stageId?: string) {
  const { isMine } = useGroupOwnership(childId)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [childDetail, setChildDetail] = useState<ChildDetail | null>(null)
  const [assessmentMap, setAssessmentMap] = useState<Map<string, Assessment>>(new Map())
  const [isPresent, setIsPresent] = useState(false)

  // Perbaikan-1: scores are filtered to the ACTIVE topic's leaves. The
  // participant-scoped List endpoint is session-wide, so without this filter
  // topik-1 scores would leak into the topik-2 view (same session_substage_id
  // map, wrong topic). Missing/empty leaf list → empty map (fail closed).
  const fetchAssessments = useCallback(async (activeLeafIds?: Set<string>) => {
    if (!childId) return
    try {
      const assessments = await assessmentService.getByParticipant(childId)
      const map = new Map<string, Assessment>()
      for (const a of assessments) {
        if (activeLeafIds && !activeLeafIds.has(a.session_substage_id)) continue
        map.set(a.session_substage_id, a)
      }
      setAssessmentMap(map)
    } catch (error) {
      // Non-fatal: leave map empty (log — otherwise saved scores would
      // silently look unsaved).
      console.error('[useChildAssessment] assessments fetch failed', error)
    }
  }, [childId])

  const fetchData = useCallback(async () => {
    if (!childId) return
    try {
      setLoading(true)
      setError(null)

      let detail: ChildDetail | null = null
      let resolvedSessionId: string | undefined = sessionId

      if (sessionId) {
        // Fast path: caller provided the session — fetch it directly
        const sessionDetail = await sessionService.getById(sessionId)
        if (sessionDetail) {
          detail = await buildDetail(sessionDetail, childId, stageId)
        }
      } else {
        // Slow path: search all sessions for this child
        const result = await findChildInSessions(childId, stageId)
        detail = result.detail
        resolvedSessionId = result.sessionId
      }

      if (!detail) {
        setError(i18n.t('fasilitator.assessment.childNotFound'))
        return
      }
      setChildDetail(detail)

      // Fire-and-forget: merge server progress rows when they arrive (drives
      // the per-Kegiatan lock). Never awaited — a slow progress endpoint must
      // not delay leaves/scores. Stale guard: only merge when the fetched
      // detail is still the rendered one (childId/sessionId/stageId unchanged).
      const detailSessionId = detail.session.id
      const detailGroupId = detail.group?.id
      const detailStageId = detail.sessionStage?.id
      void fetchGroupProgress(detailSessionId, detailGroupId).then((rows) => {
        if (rows.length === 0) return
        setChildDetail((prev) => {
          if (!prev) return prev
          if (prev.session.id !== detailSessionId) return prev
          if (prev.group?.id !== detailGroupId) return prev
          if (prev.sessionStage?.id !== detailStageId) return prev
          return { ...prev, groupProgressRows: rows }
        })
      })

      // Fetch attendance for this child using the correct session.
      // Perbaikan-1 OPSI B: attendance stays SESSION-scoped (one whole-session
      // row per participant) — the toggle lives once on GroupPage and this
      // page only reads it as the grading gate (hadir prasyarat nilai).
      if (resolvedSessionId) {
        try {
          const attRes = await attendanceService.getBySession(resolvedSessionId)
          const att = attRes.find(a => a.participant_id === childId)
          setIsPresent(att?.is_present ?? false)
        } catch (error) {
          // Attendance defaults to absent (fail closed) — log the failure so
          // the banner is traceable to a fetch error, not real absence.
          console.error('[useChildAssessment] attendance fetch failed', error)
          setIsPresent(false)
        }
      }

      // Fetch assessments filtered to the active topic's leaves.
      await fetchAssessments(new Set(detail.sessionSubstages.map((s) => s.id)))
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }, [childId, sessionId, stageId, fetchAssessments])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const refreshAssessments = useCallback(async () => {
    const leafIds = childDetail ? new Set(childDetail.sessionSubstages.map((s) => s.id)) : undefined
    await fetchAssessments(leafIds)
  }, [fetchAssessments, childDetail])

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
