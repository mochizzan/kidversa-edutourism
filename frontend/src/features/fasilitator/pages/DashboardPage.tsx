import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar } from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { sessionService } from '../../../core/services/sessions'
import { liveService } from '../../../core/services/live'
import { programService } from '../../../core/services/programs'
import { SessionStatus } from '../../../core/types/enums'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { Badge } from '../../../shared/components/ui/Badge'
import { SessionCard } from '../components/SessionCard'
import { GroupCard } from '../components/GroupCard'
import type { Session, SessionStage, ProgramStage } from '../../../core/types'
import type { LiveGroupWithProgress } from '../../../core/services/live'

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  KOORDINATOR: 'Koordinator',
  FASILITATOR: 'Fasilitator',
}

function SkeletonCard() {
  return (
    <div className="bg-surface rounded-2xl p-5 shadow-sm border border-outline-variant/50 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="h-5 bg-surface-container-high rounded w-3/5" />
        <div className="h-5 bg-surface-container-high rounded w-16" />
      </div>
      <div className="flex gap-4">
        <div className="h-4 bg-surface-container-high rounded w-24" />
        <div className="h-4 bg-surface-container-high rounded w-32" />
      </div>
    </div>
  )
}

const DashboardPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [groups, setGroups] = useState<LiveGroupWithProgress[]>([])
  const [sessionStages, setSessionStages] = useState<SessionStage[]>([])
  const [stageMap, setStageMap] = useState<Record<string, string>>({})

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const today = new Date().toISOString().split('T')[0]

      // Fetch all sessions and filter for active today
      const res = await sessionService.getAll({ limit: 100 })
      const todayActive = res.data.filter(
        (s) => s.status === SessionStatus.ACTIVE && s.session_date === today,
      )
      setSessions(todayActive)

      if (todayActive.length > 0) {
        const activeSession = todayActive[0]
        const detail = await sessionService.getById(activeSession.id)
        if (detail) {
          setSessionStages(detail.stages)

          // Get groups with progress
          const groupsWithProgress = await liveService.getGroupsWithProgress(activeSession.id)
          setGroups(groupsWithProgress)

          // Get program stages for stage name lookup
          const programStages = await programService.getStages(detail.program_id)
          const map: Record<string, string> = {}
          programStages.forEach((ps: ProgramStage) => {
            map[ps.id] = ps.name
          })
          setStageMap(map)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const getStageName = (sessionStageId: string): string | undefined => {
    const ss = sessionStages.find((s) => s.id === sessionStageId)
    if (!ss) return undefined
    return stageMap[ss.program_stage_id]
  }

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-2">
          <div className="h-8 bg-surface-container-high rounded w-48 animate-pulse" />
          <div className="h-6 bg-surface-container-high rounded w-24 animate-pulse" />
        </div>
        <div className="h-5 bg-surface-container-high rounded w-32 mb-4 animate-pulse" />
        <div className="grid gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard Fasilitator" />
        <ErrorState message={error} onRetry={fetchData} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-on-surface">
            Hai, {user?.name ?? 'Fasilitator'}!
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="primary" size="sm">
              {roleLabel[user?.role ?? ''] ?? 'Fasilitator'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Sesi Hari Ini */}
      <section>
        <h2 className="text-lg font-semibold text-on-surface mb-4">Sesi Hari Ini</h2>

        {sessions.length === 0 ? (
          <EmptyState
            icon={<Calendar className="w-12 h-12" />}
            title="Tidak ada sesi hari ini"
            description="Belum ada sesi aktif untuk hari ini. Silakan periksa jadwal Anda."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </section>

      {/* Kelompok */}
      {sessions.length > 0 && groups.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-on-surface mb-4">Kelompok</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {groups.map((item) => (
              <GroupCard
                key={item.group.id}
                name={item.group.name}
                childCount={item.participants.length}
                currentStage={
                  item.group.current_stage_id
                    ? getStageName(item.group.current_stage_id)
                    : undefined
                }
                status={item.group.status}
                onClick={() => navigate(`/fasilitator/groups/${item.group.id}`)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default DashboardPage
