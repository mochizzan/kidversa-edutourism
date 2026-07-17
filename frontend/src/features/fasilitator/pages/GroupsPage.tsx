import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Users, Calendar } from 'lucide-react'
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

function deriveGroupStatus(progress: GroupStageProgressRow[]): 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' {
  if (progress.length === 0) return 'WAITING'
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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionIdFilter = searchParams.get('sessionId')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [groupsBySession, setGroupsBySession] = useState<Record<string, LiveGroupWithProgress[]>>({})
  const [stageNameCache, setStageNameCache] = useState<Record<string, Record<string, string>>>({})

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await sessionService.getAll({ limit: 100 })
      let activeSessions = res.data.filter(
        (s) => s.status === SessionStatus.ACTIVE,
      )
      if (sessionIdFilter) {
        activeSessions = activeSessions.filter((s) => s.id === sessionIdFilter)
      }
      setSessions(activeSessions)

      // Fetch groups + stage names per session
      const groupsMap: Record<string, LiveGroupWithProgress[]> = {}
      const stageMap: Record<string, Record<string, string>> = {}

      for (const session of activeSessions) {
        const detail = await sessionService.getById(session.id)
        if (!detail) continue

        const groups = await liveService.getGroupsWithProgress(session.id)
        groupsMap[session.id] = groups

        // Build stage name map
        const programStages = await programService.getStages(detail.program_id)
        const map: Record<string, string> = {}
        programStages.forEach((ps: ProgramStage) => {
          map[ps.id] = ps.name
        })
        const ssMap: Record<string, string> = {}
        detail.stages.forEach((ss: SessionStage) => {
          ssMap[ss.id] = map[ss.program_stage_id] || ''
        })
        stageMap[session.id] = ssMap
      }

      setGroupsBySession(groupsMap)
      setStageNameCache(stageMap)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }, [sessionIdFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Semua Kelompok" />
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
        <PageHeader title="Semua Kelompok" />
        <ErrorState message={error} onRetry={fetchData} />
      </div>
    )
  }

  // ── Empty ──
  if (sessions.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Semua Kelompok" />
        <EmptyState
          icon={<Users className="w-12 h-12" />}
          title="Belum ada kelompok"
          description="Belum ada sesi aktif dengan kelompok yang tersedia."
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Semua Kelompok" />

      {sessions.map((session) => {
        const groups = groupsBySession[session.id] || []

        return (
          <section key={session.id}>
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-on-surface-variant" />
              <h2 className="text-lg font-semibold text-on-surface">{session.name}</h2>
            </div>

            {groups.length === 0 ? (
              <p className="text-sm text-on-surface-variant ml-7">
                Belum ada kelompok untuk sesi ini.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {groups.map((item) => (
                  <GroupCard
                    key={item.group.id}
                    name={item.group.name}
                    childCount={item.participants.length}
                    currentStage={
                      item.group.current_stage_id
                        ? stageNameCache[session.id]?.[item.group.current_stage_id]
                        : undefined
                    }
                    status={deriveGroupStatus(item.progress)}
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
