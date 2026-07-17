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
import type { Session, SessionStage, ProgramStage } from '../../../core/types'
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSessionId])

  useEffect(() => {
    fetchData()
  }, [fetchData, urlSessionId])

  const getGroupStatus = useCallback(
    (g: LiveGroupWithProgress): { status: GroupStatus; stageId?: string } => {
      if (g.progress.length === 0) return { status: 'LOCKED', stageId: undefined }

      const active = g.progress.find((p) => p.status === GroupStageProgressStatus.IN_PROGRESS)
      if (active) return { status: 'IN_PROGRESS', stageId: active.session_stage_id }

      const unlocked = g.progress.find((p) => p.status === GroupStageProgressStatus.UNLOCKED)
      if (unlocked) return { status: 'UNLOCKED', stageId: unlocked.session_stage_id }

      const allDone = g.progress.every(
        (p) =>
          p.status === GroupStageProgressStatus.COMPLETED ||
          p.status === GroupStageProgressStatus.SKIPPED,
      )
      if (allDone) return { status: 'COMPLETED', stageId: undefined }

      const hasDone = g.progress.some(
        (p) =>
          p.status === GroupStageProgressStatus.COMPLETED ||
          p.status === GroupStageProgressStatus.SKIPPED,
      )
      if (hasDone) return { status: 'COMPLETED', stageId: undefined }

      return { status: 'LOCKED', stageId: undefined }
    },
    [],
  )

  const getActiveStageIndex = useCallback(
    (g: LiveGroupWithProgress) => {
      const activeProgress = g.progress.find(
        (p) =>
          p.status === GroupStageProgressStatus.IN_PROGRESS ||
          p.status === GroupStageProgressStatus.UNLOCKED,
      )
      if (!activeProgress) return { current: 0, total: programStages.length }

      const ss = stages.find((s) => s.id === activeProgress.session_stage_id)
      const ps = programStages.find((p) => p.id === ss?.program_stage_id)

      return { current: ps?.sequence_order ?? 0, total: programStages.length }
    },
    [stages, programStages],
  )

  const getNextLockedStageId = useCallback(
    (g: LiveGroupWithProgress): string | undefined => {
      const sorted = [...g.progress].sort((a, b) => {
        const sa = stages.find((s) => s.id === a.session_stage_id)
        const sb = stages.find((s) => s.id === b.session_stage_id)
        const pa = programStages.find((p) => p.id === sa?.program_stage_id)
        const pb = programStages.find((p) => p.id === sb?.program_stage_id)
        return (pa?.sequence_order ?? 0) - (pb?.sequence_order ?? 0)
      })
      return sorted.find((p) => p.status === GroupStageProgressStatus.LOCKED)?.session_stage_id
    },
    [stages, programStages],
  )

  const handleConfirm = useCallback(
    async (
      groupId: string,
      action: 'skip' | 'jump' | 'reset',
      reason: string,
      targetStageId?: string,
    ) => {
      if (!activeSession || !user) return
      try {
        if (action === 'skip') {
          const progressList = groups.find((g) => g.group.id === groupId)?.progress
          const active = progressList?.find(
            (p) =>
              p.status === GroupStageProgressStatus.IN_PROGRESS ||
              p.status === GroupStageProgressStatus.UNLOCKED,
          )
          if (active) await liveService.skipStage(groupId, active.session_stage_id, reason, user.id)
        } else if (action === 'jump' && targetStageId) {
          await liveService.jumpToStage(groupId, targetStageId, reason, user.id)
        } else if (action === 'reset') {
          await liveService.resetProgress(groupId, reason, user.id)
        }
        await liveService.addTimelineEvent(
          activeSession.id,
          groupId,
          'override',
          `Override: ${action} — ${reason}`,
          user.id,
        )
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          redirectToLogin()
        }
      }
    },
    [activeSession, user, groups],
  )

  const handleUnlock = useCallback(
    async (groupId: string, sessionStageId: string) => {
      if (!user || !activeSession) return
      try {
        await liveService.unlockStage(groupId, sessionStageId, user.id)
        const group = groups.find((g) => g.group.id === groupId)
        const ss = stages.find((s) => s.id === sessionStageId)
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
    [user, activeSession, groups, stages, programStages],
  )

  const handleComplete = useCallback(
    async (groupId: string, sessionStageId: string) => {
      if (!activeSession || !user) return
      try {
        await liveService.completeStage(groupId, sessionStageId)
        const group = groups.find((g) => g.group.id === groupId)
        const ss = stages.find((s) => s.id === sessionStageId)
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
    [activeSession, user, groups, stages, programStages],
  )

  return {
    activeSession,
    stages,
    programStages,
    allActiveSessions,
    stageNames,
    groups,
    timeline,
    connectionStatus,
    loading,
    liveLoading,
    error,
    fetchData,
    getGroupStatus,
    getActiveStageIndex,
    getNextLockedStageId,
    handleConfirm,
    handleUnlock,
    handleComplete,
  }
}
