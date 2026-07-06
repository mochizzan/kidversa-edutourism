import { useState, useEffect, useCallback } from 'react'
import { Calendar, Users, CheckCircle, XCircle } from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { sessionService } from '../../../core/services/sessions'
import { assessmentService } from '../../../core/services/assessments'
import { programService } from '../../../core/services/programs'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { Badge } from '../../../shared/components/ui/Badge'
import { formatDate } from '../../../shared/utils'
import { SessionStatus } from '../../../core/types/enums'
import type { Session } from '../../../core/types'

interface ActivityItem {
  id: string
  session: Session
  stageName: string
  childrenAssessed: number
  status: 'COMPLETED' | 'CANCELLED'
}

function SkeletonRow() {
  return (
    <div className="bg-surface rounded-2xl p-5 shadow-sm border border-outline-variant/50 animate-pulse">
      <div className="h-5 bg-surface-container-high rounded w-2/3 mb-3" />
      <div className="flex gap-4">
        <div className="h-4 bg-surface-container-high rounded w-28" />
        <div className="h-4 bg-surface-container-high rounded w-20" />
      </div>
    </div>
  )
}

const ActivitiesPage = () => {
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])

  const fetchActivities = useCallback(async () => {
    if (!user) return
    try {
      setLoading(true)
      setError(null)

      // Fetch completed and cancelled sessions
      const res = await sessionService.getAll({ limit: 100 })
      const historySessions = res.data.filter(
        (s) => s.status === SessionStatus.COMPLETED || s.status === SessionStatus.CANCELLED,
      )

      const items: ActivityItem[] = []

      for (const session of historySessions) {
        const detail = await sessionService.getById(session.id)
        if (!detail) continue

        // Find stages assigned to this fasilitator
        const myStages = detail.stages.filter((s) => s.fasilitator_id === user.id)
        if (myStages.length === 0) continue

        // Get program stages for name lookup
        const programStages = await programService.getStages(detail.program_id)
        const stageNameMap = new Map(programStages.map((ps) => [ps.id, ps.name]))

        // Get assessment count for this session
        const assessments = await assessmentService.getBySession(session.id)
        const assessedParticipantIds = new Set(assessments.map((a) => a.participant_id))

        // Use the first stage name as representative
        const firstStage = myStages[0]
        const stageName = stageNameMap.get(firstStage.program_stage_id) ?? 'Stage'

        items.push({
          id: session.id,
          session,
          stageName,
          childrenAssessed: assessedParticipantIds.size,
          status: session.status as 'COMPLETED' | 'CANCELLED',
        })
      }

      setActivities(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat aktivitas')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  const filteredActivities = activities.filter(
    (a) => a.session.session_date === selectedDate,
  )

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Aktivitas Saya" subtitle="Riwayat sesi dan stage yang telah dikerjakan." />
        <div className="bg-surface rounded-2xl p-4 shadow-sm border border-outline-variant/50 animate-pulse">
          <div className="h-10 bg-surface-container-high rounded w-48" />
        </div>
        <div className="grid gap-4">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Aktivitas Saya" />
        <ErrorState message={error} onRetry={fetchActivities} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aktivitas Saya"
        subtitle="Riwayat sesi dan stage yang telah dikerjakan."
      />

      {/* Date Filter */}
      <div className="bg-surface rounded-2xl p-4 shadow-sm border border-outline-variant/50">
        <div className="flex items-center gap-4">
          <Calendar className="w-5 h-5 text-on-surface-variant shrink-0" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border border-outline-variant rounded-xl px-3 py-2 text-sm text-on-surface bg-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
          />
          <span className="text-sm text-on-surface-variant">
            {filteredActivities.length} aktivitas ditemukan
          </span>
        </div>
      </div>

      {/* Activities List */}
      <div className="space-y-4">
        {filteredActivities.map((activity) => (
          <div
            key={activity.id}
            className="bg-surface rounded-2xl p-5 shadow-sm border border-outline-variant/50 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h3 className="text-base font-semibold text-on-surface">
                    {activity.session.name}
                  </h3>
                  <Badge
                    variant={activity.status === 'COMPLETED' ? 'success' : 'danger'}
                    size="sm"
                  >
                    {activity.status === 'COMPLETED' ? 'Selesai' : 'Dibatalkan'}
                  </Badge>
                </div>

                <p className="text-sm text-on-surface-variant mb-3">
                  {activity.stageName}
                </p>

                <div className="flex items-center gap-4 text-sm text-on-surface-variant flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 shrink-0" />
                    <span>{formatDate(activity.session.session_date)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 shrink-0" />
                    <span>{activity.childrenAssessed} anak dinilai</span>
                  </div>
                </div>
              </div>

              {/* Status icon */}
              <div className="shrink-0 mt-1">
                {activity.status === 'COMPLETED' ? (
                  <CheckCircle className="w-6 h-6 text-green-500" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-400" />
                )}
              </div>
            </div>
          </div>
        ))}

        {filteredActivities.length === 0 && !loading && (
          <EmptyState
            icon={<Calendar className="w-12 h-12" />}
            title="Belum ada aktivitas"
            description="Tidak ada sesi selesai atau dibatalkan pada tanggal ini."
          />
        )}
      </div>
    </div>
  )
}

export default ActivitiesPage
