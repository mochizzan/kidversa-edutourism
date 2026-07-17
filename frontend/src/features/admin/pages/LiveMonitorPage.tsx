import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Radio,
  Calendar,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Users,
  Monitor,
} from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { GroupStageProgressStatus, UserRole } from '../../../core/types/enums'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Badge } from '../../../shared/components/ui/Badge'
import { Button } from '../../../shared/components/ui/Button'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { cn } from '../../../core/utils'
import { formatDate } from '../../../shared/utils'
import { TimelineFeed } from '../components/TimelineFeed'
import { ConfirmOverrideModal } from '../components/ConfirmOverrideModal'
import { LiveGroupCard } from '../components/LiveGroupCard'
import { useLiveMonitor } from '../hooks/useLiveMonitor'

const LiveMonitorPage = () => {
  const { user } = useAuth()
  const isKoordinator = user?.role === UserRole.KOORDINATOR || user?.role === UserRole.ADMIN

  const { sessionId: urlSessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const {
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
  } = useLiveMonitor(urlSessionId)

  const [overrideModal, setOverrideModal] = useState<{
    groupId: string
    action: 'skip' | 'jump' | 'reset'
  } | null>(null)

  if (loading || liveLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Live Monitor" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 bg-surface-variant rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-60 bg-surface-variant rounded-xl animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <ErrorState
        title="Gagal Memuat"
        message={error}
        action={{ label: 'Coba Lagi', onClick: fetchData }}
      />
    )
  }

  if (!activeSession) {
    return (
      <div className="space-y-6">
        <PageHeader title="Live Monitor" />
        <EmptyState
          icon={<Radio className="w-12 h-12" />}
          title="Tidak ada sesi aktif"
          description="Belum ada sesi yang sedang berlangsung saat ini"
        />
      </div>
    )
  }

  const allCompleted =
    groups.length > 0 &&
    groups.every(
      (g) =>
        g.progress.length > 0 &&
        g.progress.every(
          (p) =>
            p.status === GroupStageProgressStatus.COMPLETED ||
            p.status === GroupStageProgressStatus.SKIPPED,
        ),
    )

  const connectionBadge =
    connectionStatus === 'online' ? null : (
      <Badge variant={connectionStatus === 'reconnecting' ? 'warning' : 'neutral'}>
        {connectionStatus === 'reconnecting' ? 'Menyambung ulang…' : 'Koneksi lemah'}
      </Badge>
    )

  const hasActiveGroup = groups.some((g) => {
    const { status } = getGroupStatus(g)
    return status === 'IN_PROGRESS' || status === 'UNLOCKED'
  })

  const sortedGroups = [...groups].sort((a, b) => {
    const order = { IN_PROGRESS: 0, UNLOCKED: 1, COMPLETED: 2, LOCKED: 3 }
    const sa = getGroupStatus(a).status
    const sb = getGroupStatus(b).status
    return (order[sa] ?? 4) - (order[sb] ?? 4)
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <PageHeader title="Live Monitor" subtitle={activeSession.name} />
          <div className="flex items-center gap-4 mt-2 text-sm text-on-surface-variant">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {formatDate(activeSession.session_date)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {activeSession.location}
            </span>
            {hasActiveGroup && (
              <Badge variant="success">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Live
                </span>
              </Badge>
            )}
            {connectionBadge}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {allActiveSessions.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-on-surface-variant font-medium">Sesi:</label>
              <select
                value={activeSession?.id || ''}
                onChange={(e) => navigate(`/admin/live/${e.target.value}`)}
                className="px-3 py-1.5 rounded-xl border text-sm bg-surface-container-low border-outline-variant/60 text-on-surface"
              >
                {allActiveSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {formatDate(s.session_date)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const activeGroup = groups.find((g) => {
                const { status } = getGroupStatus(g)
                return status === 'IN_PROGRESS' || status === 'UNLOCKED'
              })
              if (activeGroup && activeSession) {
                const { stageId } = getGroupStatus(activeGroup)
                if (stageId) window.open(`/learner/${activeSession.id}/${stageId}`, '_blank')
              }
            }}
            disabled={!hasActiveGroup}
          >
            <Monitor className="w-4 h-4 mr-1" />
            Buka Kiosk
          </Button>
          <Button variant="ghost" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {allCompleted && (
        <div className="bg-success-container text-on-success-container rounded-xl p-6 text-center">
          <h2 className="text-xl font-bold">🎉 Semua kelompok selesai!</h2>
          <p className="mt-1">
            Sesi telah berakhir. Semua kelompok telah menyelesaikan semua stage.
          </p>
        </div>
      )}

      {groups.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: groups.length, icon: Users, color: 'text-on-surface' },
            {
              label: 'Selesai',
              value: groups.filter(
                (g) =>
                  g.progress.length > 0 &&
                  g.progress.every(
                    (p) =>
                      p.status === GroupStageProgressStatus.COMPLETED ||
                      p.status === GroupStageProgressStatus.SKIPPED,
                  ),
              ).length,
              icon: CheckCircle2,
              color: 'text-green-600',
            },
            {
              label: 'Berlangsung',
              value: groups.filter((g) => {
                const s = getGroupStatus(g).status
                return s === 'IN_PROGRESS' || s === 'UNLOCKED'
              }).length,
              icon: AlertTriangle,
              color: 'text-amber-600',
            },
            {
              label: 'Menunggu',
              value: groups.filter((g) => getGroupStatus(g).status === 'LOCKED').length,
              icon: Monitor,
              color: 'text-gray-500',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-surface rounded-xl p-4 border border-outline-variant/40"
            >
              <div className="flex items-center gap-2 text-on-surface-variant text-sm mb-1">
                <stat.icon className="w-4 h-4" />
                <span>{stat.label}</span>
              </div>
              <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sortedGroups.map((g) => {
          const { status, stageId } = getGroupStatus(g)
          return (
            <LiveGroupCard
              key={g.group.id}
              group={g}
              status={status}
              stageId={stageId}
              activeIndex={getActiveStageIndex(g)}
              stages={stages}
              programStages={programStages}
              stageNames={stageNames}
              isKoordinator={isKoordinator}
              allCompleted={allCompleted}
              nextLockedStageId={getNextLockedStageId(g)}
              onComplete={handleComplete}
              onUnlock={handleUnlock}
              onOverride={(groupId, action) => setOverrideModal({ groupId, action })}
            />
          )
        })}
      </div>

      <div className="bg-surface rounded-xl p-5 border border-outline-variant">
        <h3 className="font-semibold text-on-surface mb-4">Timeline Aktivitas</h3>
        <TimelineFeed events={timeline} />
      </div>

      {overrideModal && (
        <ConfirmOverrideModal
          open={true}
          actionType={overrideModal.action}
          availableStages={stages.map((s) => ({
            value: s.id,
            label: stageNames[s.id] || s.id,
          }))}
          onConfirm={async (reason, targetStageId) => {
            await handleConfirm(overrideModal.groupId, overrideModal.action, reason, targetStageId)
            setOverrideModal(null)
          }}
          onClose={() => setOverrideModal(null)}
        />
      )}
    </div>
  )
}

export default LiveMonitorPage
