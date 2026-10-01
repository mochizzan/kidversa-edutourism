import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Users, Calendar, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../core/hooks/useAuth'
import { sessionService } from '../../../core/services/sessions'
import { liveService } from '../../../core/services/live'
import { programService } from '../../../core/services/programs'
import { SessionStatus } from '../../../core/types/enums'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { GroupCard } from '../components/GroupCard'
import type { Session, SessionStage, ProgramStage } from '../../../core/types'
import type { LiveGroupWithProgress, GroupStageProgressRow } from '../../../core/services/live'
import { friendlyError } from '../../../core/utils/errorMessages'

function deriveGroupStatus(progress?: GroupStageProgressRow[] | null): 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' {
  if (!progress || progress.length === 0) return 'WAITING'
  if (progress.some((p) => p.status === 'IN_PROGRESS' || p.status === 'UNLOCKED')) return 'IN_PROGRESS'
  if (progress.every((p) => p.status === 'COMPLETED' || p.status === 'SKIPPED')) return 'COMPLETED'
  return 'WAITING'
}

function SkeletonCard() {
  return (
    <div className="bg-surface rounded-2xl p-5 shadow-sm border border-outline-variant/50 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="h-5 bg-surface-container-high rounded w-3/5" />
        <div className="h-5 bg-surface-container-high rounded w-16" />
      </div>
      <div className="h-4 bg-surface-container-high rounded w-32" />
    </div>
  )
}

const GroupsPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const sessionIdFilter = searchParams.get('sessionId')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [groupsBySession, setGroupsBySession] = useState<Record<string, LiveGroupWithProgress[]>>({})
  const [stageNameCache, setStageNameCache] = useState<Record<string, Record<string, string>>>({})
  // ?sessionId= points at a session that does not exist / is not ACTIVE
  // (stale link, COMPLETED session) — distinct from "session has no groups".
  const [sessionNotFound, setSessionNotFound] = useState(false)
  // Per-session sub-fetch failures: sessionId → visible message. One failing
  // session must not take down the whole page.
  const [sessionErrors, setSessionErrors] = useState<Record<string, string>>({})

  // Loads one session's detail + groups + stage names. Throws on any failure
  // so callers can decide (per-session inline error vs. full-page error).
  const loadSessionData = useCallback(async (session: Session) => {
    const detail = await sessionService.getById(session.id)
    if (!detail) {
      throw new Error(`session detail unavailable: ${session.id}`)
    }

    const groups = await liveService.getGroupsWithProgress(session.id)

    // Build stage name map
    const programStages = await programService.getStages(detail.program_id)
    const map: Record<string, string> = {}
      ; (programStages ?? []).forEach((ps: ProgramStage) => {
        map[ps.id] = ps.name
      })
    const ssMap: Record<string, string> = {}
      ; (detail.stages ?? []).forEach((ss: SessionStage) => {
        ssMap[ss.id] = map[ss.program_stage_id] || ''
      })
    return { groups, stageNames: ssMap }
  }, [])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setSessionNotFound(false)

      const res = await sessionService.getAll({ limit: 100 })
      const data = res.data ?? []
      let activeSessions = data.filter(
        (s) => s.status === SessionStatus.ACTIVE,
      )
      if (sessionIdFilter) {
        activeSessions = activeSessions.filter((s) => s.id === sessionIdFilter)
        if (activeSessions.length === 0) {
          setSessionNotFound(true)
        }
      }
      setSessions(activeSessions)

      // Fetch groups + stage names per session; a failing session only
      // produces an inline error for its own section.
      const groupsMap: Record<string, LiveGroupWithProgress[]> = {}
      const stageMap: Record<string, Record<string, string>> = {}
      const errs: Record<string, string> = {}

      for (const session of activeSessions) {
        try {
          const { groups, stageNames } = await loadSessionData(session)
          groupsMap[session.id] = groups
          stageMap[session.id] = stageNames
        } catch (err) {
          errs[session.id] = friendlyError(err)
        }
      }

      setGroupsBySession(groupsMap)
      setStageNameCache(stageMap)
      setSessionErrors(errs)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }, [sessionIdFilter, loadSessionData])

  // Retries only the failed session's sub-fetches; the rest of the page stays
  // rendered the whole time.
  const retrySession = useCallback(async (session: Session) => {
    setSessionErrors((prev) => {
      const next = { ...prev }
      delete next[session.id]
      return next
    })
    try {
      const { groups, stageNames } = await loadSessionData(session)
      setGroupsBySession((prev) => ({ ...prev, [session.id]: groups }))
      setStageNameCache((prev) => ({ ...prev, [session.id]: stageNames }))
    } catch (err) {
      setSessionErrors((prev) => ({ ...prev, [session.id]: friendlyError(err) }))
    }
  }, [loadSessionData])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('fasilitator.groups.pageTitle')} />
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    )
  }

  // ── Error ──
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('fasilitator.groups.pageTitle')} />
        <ErrorState message={error} onRetry={fetchData} />
      </div>
    )
  }

  // ── ?sessionId= doesn't match an active session (stale/finished link) ──
  if (sessionNotFound) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('fasilitator.groups.pageTitle')} />
        <EmptyState
          icon={<Users className="w-12 h-12" />}
          title={t('fasilitator.groups.sessionNotFoundTitle')}
          description={t('fasilitator.groups.sessionNotFoundDesc')}
        />
      </div>
    )
  }

  // ── Empty ──
  if (sessions.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('fasilitator.groups.pageTitle')} />
        <EmptyState
          icon={<Users className="w-12 h-12" />}
          title={t('fasilitator.groups.emptyTitle')}
          description={t('fasilitator.groups.emptyDesc')}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('fasilitator.groups.pageTitle')} />

      {sessions.map((session) => {
        const groups = groupsBySession[session.id] || []

        return (
          <section key={session.id}>
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-on-surface-variant" />
              <h2 className="text-lg font-semibold text-on-surface">{session.name}</h2>
            </div>

            {sessionErrors[session.id] ? (
              <div
                role="alert"
                className="ml-7 rounded-xl border border-error/40 p-4 space-y-2"
              >
                <p className="text-sm text-on-surface">{sessionErrors[session.id]}</p>
                <button
                  type="button"
                  onClick={() => retrySession(session)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors text-sm font-medium"
                >
                  <RefreshCw className="w-4 h-4" />
                  {t('common.error.retry')}
                </button>
              </div>
            ) : groups.length === 0 ? (
              <p className="text-sm text-on-surface-variant ml-7">
                {t('fasilitator.groups.emptySession')}
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {groups.map((item) => (
                  <GroupCard
                    key={item.group.id}
                    name={item.group.name}
                    childCount={item.participants?.length ?? 0}
                    currentStage={
                      item.group.current_session_stage_id
                        ? stageNameCache[session.id]?.[item.group.current_session_stage_id]
                        : undefined
                    }
                    status={deriveGroupStatus(item.progress)}
                    isOwner={item.is_owner}
                    facilitatorId={item.group.facilitator_id}
                    currentUserId={user?.id}
                    onClick={() => navigate(`/fasilitator/groups/${item.group.id}`)}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

export default GroupsPage
