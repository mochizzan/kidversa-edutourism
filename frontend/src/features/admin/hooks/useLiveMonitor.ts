import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../core/hooks/useAuth'
import { sessionService } from '../../../core/services/sessions'
import { liveService } from '../../../core/services/live'
import { programService } from '../../../core/services/programs'
import { useLiveSession } from '../../../core/hooks/useLiveSession'
import { SessionStatus, GroupStageProgressStatus } from '../../../core/types/enums'
import { ApiError } from '../../../core/services/backendClient'
import { redirectToLogin } from '../../../core/stores/authStore'
import { parentStageId, substagesOfStage } from '../../../core/utils/substage'
import type { Session, SessionStage, ProgramStage, SessionSubstage } from '../../../core/types'
import type { LiveGroupWithProgress } from '../../../core/services/live'

export type GroupStatus = 'LOCKED' | 'UNLOCKED' | 'IN_PROGRESS' | 'COMPLETED'

export function useLiveMonitor(urlSessionId: string | undefined) {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [stages, setStages] = useState<SessionStage[]>([])
  const [programStages, setProgramStages] = useState<ProgramStage[]>([])
  const [allActiveSessions, setAllActiveSessions] = useState<Session[]>([])
  const [stageNames, setStageNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const {
    groups: liveGroups,
    progress,
    participantsByGroup,
    timeline,
    connectionStatus,
    loading: liveLoading,
  } = useLiveSession(activeSession?.id ?? null)

  const groups: LiveGroupWithProgress[] = useMemo(
    () =>
      liveGroups.map((g) => ({
        group: g,
        progress: progress.filter((p) => p.group_id === g.id),
        participants: participantsByGroup[g.id] ?? [],
      })),
    [liveGroups, progress, participantsByGroup],
  )

  // Session substages (Kegiatan leaves) for the live session. The live snapshot
  // does not carry them, so they come from the dedicated read endpoint
  // (GET /api/session-substages?session_id=...). They are what resolves a
  // Kegiatan-level progress row up to its parent SubTopik for display.
  const [sessionSubstages, setSessionSubstages] = useState<SessionSubstage[]>([])

  const loadSessionSubstages = useCallback(async () => {
    if (!activeSession) {
      setSessionSubstages([])
      return
    }
    try {
      setSessionSubstages(await sessionService.getSubstages(activeSession.id))
    } catch {
      setSessionSubstages([])
    }
  }, [activeSession])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await sessionService.getAll({ limit: 20 })
      const activeSessions = result.data.filter((s: Session) => s.status === SessionStatus.ACTIVE)
      setAllActiveSessions(activeSessions)

      let session: Session | null = null
      if (urlSessionId) {
        session = activeSessions.find((s) => s.id === urlSessionId) || null
      }
      if (!session && activeSessions.length > 0) {
        session = activeSessions[0]
        if (session) navigate(`/admin/live/${session.id}`, { replace: true })
      }

      if (session) {
        setActiveSession(session)
        const [sessionStages, programStagesData] = await Promise.all([
          sessionService.getStages(session.id),
          programService.getStages(session.program_id),
        ])
        setStages(sessionStages)
        setProgramStages(programStagesData)

        const nameMap: Record<string, string> = {}
        sessionStages.forEach((ss) => {
          const ps = programStagesData.find((p) => p.id === ss.program_stage_id)
          if (ps) nameMap[ss.id] = ps.name
        })
        setStageNames(nameMap)
      } else {
        setActiveSession(null)
        setStages([])
        setProgramStages([])
        setStageNames({})
      }
    } catch {
      setError('Gagal memuat data live monitor')
    } finally {
      setLoading(false)
    }
  }, [urlSessionId, navigate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Progress rows are Kegiatan-level, so their SubTopik order is reached by
  // resolving up: Kegiatan -> parent SubTopik -> program stage sequence_order.
  // Kegiatan sharing a SubTopik tie-break on the substage's created_at then id,
  // matching the leaf order used everywhere else.
  const progressOrderKey = useCallback(
    (sessionSubstageId: string): [number, number, string] => {
      const stageId = parentStageId(sessionSubstages, sessionSubstageId)
      const ss = stages.find((s) => s.id === stageId)
      const ps = programStages.find((p) => p.id === ss?.program_stage_id)
      const sub = sessionSubstages.find((s) => s.id === sessionSubstageId)
      return [
        ps?.sequence_order ?? 0,
        sub ? new Date(sub.created_at).getTime() : 0,
        sessionSubstageId,
      ]
    },
    [sessionSubstages, stages, programStages],
  )

  const getNextLockedStageId = useCallback(
    (g: LiveGroupWithProgress): string | undefined => {
      const keyed = g.progress.map((p) => ({ p, k: progressOrderKey(p.session_substage_id) }))
      keyed.sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2].localeCompare(b.k[2]))
      // Returns a Kegiatan id — it feeds onUnlock, whose route writes the
      // FK-constrained group_stage_progress.session_substage_id column.
      return keyed.find(({ p }) => p.status === GroupStageProgressStatus.LOCKED)?.p
        .session_substage_id
    },
    [progressOrderKey],
  )

  const getGroupStatus = useCallback(
    (g: LiveGroupWithProgress): { status: GroupStatus; stageId?: string } => {
      if (g.progress.length === 0) {
        // No progress yet: frontier is the first ordered stage's first Kegiatan.
        // stageId must stay Kegiatan-level (C3) — it is posted to the unlock
        // route, which writes the FK-constrained session_substage_id column.
        const first = [...stages].sort((a, b) => {
          const pa = programStages.find((p) => p.id === a.program_stage_id)
          const pb = programStages.find((p) => p.id === b.program_stage_id)
          return (pa?.sequence_order ?? 0) - (pb?.sequence_order ?? 0)
        })[0]
        return { status: 'LOCKED', stageId: substagesOfStage(sessionSubstages, first?.id)[0]?.id }
      }
      const active = g.progress.find((p) => p.status === GroupStageProgressStatus.IN_PROGRESS)
      if (active) return { status: 'IN_PROGRESS', stageId: active.session_substage_id }
      const unlocked = g.progress.find((p) => p.status === GroupStageProgressStatus.UNLOCKED)
      if (unlocked) return { status: 'UNLOCKED', stageId: unlocked.session_substage_id }
      const nextLocked = getNextLockedStageId(g)
      if (nextLocked) return { status: 'LOCKED', stageId: nextLocked }
      // All stages completed/skipped: no frontier (terminal state).
      return { status: 'COMPLETED' }
    },
    [stages, programStages, sessionSubstages, getNextLockedStageId],
  )

  const getActiveStageIndex = useCallback(
    (g: LiveGroupWithProgress) => {
      const activeProgress = g.progress.find(
        (p) =>
          p.status === GroupStageProgressStatus.IN_PROGRESS ||
          p.status === GroupStageProgressStatus.UNLOCKED,
      )
      if (!activeProgress) return { current: 0, total: programStages.length }

      const ss = stages.find(
        (s) => s.id === parentStageId(sessionSubstages, activeProgress.session_substage_id),
      )
      const ps = programStages.find((p) => p.id === ss?.program_stage_id)

      return { current: ps?.sequence_order ?? 0, total: programStages.length }
    },
    [stages, programStages, sessionSubstages],
  )

  // sessionSubstageId is a Kegiatan id (C3); the API takes it as-is and only
  // the timeline label resolves up to the parent SubTopik's name.
  const handleUnlock = useCallback(
    async (groupId: string, sessionSubstageId: string) => {
      if (!user || !activeSession) return
      try {
        await liveService.unlockStage(groupId, sessionSubstageId, user.id)
        const group = groups.find((g) => g.group.id === groupId)
        const ss = stages.find((s) => s.id === parentStageId(sessionSubstages, sessionSubstageId))
        const ps = programStages.find((p) => p.id === ss?.program_stage_id)
        await liveService.addTimelineEvent(
          activeSession.id,
          groupId,
          'stage:unlock',
          `${group?.group.name || 'Kelompok'} di-unlock ke "${ps?.name || 'Stage'}"`,
          user.id,
        )
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) redirectToLogin()
      }
    },
    [user, activeSession, groups, stages, programStages, sessionSubstages],
  )

  // Lock is group-scoped: the backend route carries only :groupId (C6).
  const handleLock = useCallback(
    async (groupId: string) => {
      if (!user || !activeSession) return
      try {
        await liveService.lockStage(groupId, user.id)
        const group = groups.find((g) => g.group.id === groupId)
        await liveService.addTimelineEvent(
          activeSession.id,
          groupId,
          'stage:lock',
          `${group?.group.name || 'Kelompok'} dikunci`,
          user.id,
        )
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) redirectToLogin()
      }
    },
    [user, activeSession, groups],
  )

  const handleComplete = useCallback(
    async (groupId: string, sessionSubstageId: string) => {
      if (!activeSession || !user) return
      try {
        await liveService.completeStage(groupId, sessionSubstageId)
        const group = groups.find((g) => g.group.id === groupId)
        const ss = stages.find((s) => s.id === parentStageId(sessionSubstages, sessionSubstageId))
        const ps = programStages.find((p) => p.id === ss?.program_stage_id)
        await liveService.addTimelineEvent(
          activeSession.id,
          groupId,
          'group:completed',
          `${group?.group.name || 'Kelompok'} menyelesaikan "${ps?.name || 'Stage'}"`,
          user.id,
        )
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) redirectToLogin()
      }
    },
    [activeSession, user, groups, stages, programStages, sessionSubstages],
  )

  const handleCompleteKegiatan = useCallback(
    async (sessionSubstageId: string) => {
      if (!activeSession || !user) return
      try {
        await liveService.completeSessionSubstage(sessionSubstageId)
        await loadSessionSubstages()
        await liveService.addTimelineEvent(
          activeSession.id,
          '',
          'override',
          'Lanjut SubTopik — kegiatan diselesaikan',
          user.id,
        )
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) redirectToLogin()
      }
    },
    [activeSession, user, loadSessionSubstages],
  )

  // Load session substages once the active session is resolved.
  useEffect(() => {
    void loadSessionSubstages()
  }, [loadSessionSubstages])

  return {
    activeSession,
    stages,
    programStages,
    allActiveSessions,
    stageNames,
    groups,
    sessionSubstages,
    timeline,
    connectionStatus,
    loading,
    liveLoading,
    error,
    fetchData,
    getGroupStatus,
    getActiveStageIndex,
    getNextLockedStageId,
    handleUnlock,
    handleLock,
    handleComplete,
    handleCompleteKegiatan,
  }
}
