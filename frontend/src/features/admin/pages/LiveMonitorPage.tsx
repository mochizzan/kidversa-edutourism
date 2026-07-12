import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Radio,
  Calendar,
  Clock,
  RefreshCw,
  Play,
  SkipForward,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Users,
  Monitor,
} from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { sessionService } from '../../../core/services/sessions'
import { liveService } from '../../../core/services/live'
import { programService } from '../../../core/services/programs'
import { SessionStatus, GroupStageProgressStatus, UserRole } from '../../../core/types/enums'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Badge } from '../../../shared/components/ui/Badge'
import { Button } from '../../../shared/components/ui/Button'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { cn } from '../../../core/utils'
import { ApiError } from '../../../core/services/backendClient'
import { redirectToLogin } from '../../../core/stores/authStore'
import type { Session, SessionStage, ProgramStage } from '../../../core/types'
import type { TimelineEventRow, LiveGroupWithProgress } from '../../../core/services/live'
import { StageProgressBar } from '../components/StageProgressBar'
import { TimelineFeed } from '../components/TimelineFeed'
import { ConfirmOverrideModal } from '../components/ConfirmOverrideModal'

const LiveMonitorPage = () => {
  const { user } = useAuth()
  const isKoordinator = user?.role === UserRole.KOORDINATOR || user?.role === UserRole.ADMIN

  const { sessionId: urlSessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [groups, setGroups] = useState<LiveGroupWithProgress[]>([])
  const [timeline, setTimeline] = useState<TimelineEventRow[]>([])
  const [stages, setStages] = useState<SessionStage[]>([])
  const [programStages, setProgramStages] = useState<ProgramStage[]>([])
  const [allActiveSessions, setAllActiveSessions] = useState<Session[]>([])
  const [stageNames, setStageNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [simulationOn, setSimulationOn] = useState(false)
  const [overrideModal, setOverrideModal] = useState<{
    groupId: string
    action: 'skip' | 'jump' | 'reset'
  } | null>(null)
  const simulationRef = useRef<number | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await sessionService.getAll({ limit: 20 })
      const activeSessions = result.data.filter(
        (s: Session) => s.status === SessionStatus.ACTIVE
      )
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

        const [groupsData, timelineData, sessionStages, programStagesData] = await Promise.all([
          liveService.getGroupsWithProgress(session.id),
          liveService.getTimeline(session.id),
          sessionService.getStages(session.id),
          programService.getStages(session.program_id),
        ])
        setGroups(groupsData)
        setTimeline(timelineData)
        setStages(sessionStages)
        setProgramStages(programStagesData)

        // Build stage name map from program stages
        const nameMap: Record<string, string> = {}
        sessionStages.forEach((ss) => {
          const ps = programStagesData.find((p) => p.id === ss.program_stage_id)
          if (ps) nameMap[ss.id] = ps.name
        })
        setStageNames(nameMap)
      } else {
        setActiveSession(null)
        setGroups([])
        setTimeline([])
        setStages([])
        setProgramStages([])
        setStageNames({})
      }
    } catch {
      setError('Gagal memuat data live monitor')
    } finally {
      setLoading(false)
    }
  }, [urlSessionId])

  useEffect(() => {
    fetchData()
  }, [fetchData, urlSessionId])

  // Polling every 5 seconds
  useEffect(() => {
    if (!activeSession) return
    const interval = setInterval(async () => {
      try {
        const [groupsData, timelineData] = await Promise.all([
          liveService.getGroupsWithProgress(activeSession.id),
          liveService.getTimeline(activeSession.id),
        ])
        setGroups(groupsData)
        setTimeline(timelineData)
      } catch {
        // silent fail on poll
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [activeSession])

  // Simulation
  useEffect(() => {
    if (simulationOn && activeSession) {
      const runTick = async () => {
        try {
          await liveService.simulateProgress(activeSession.id)
          const [groupsData, timelineData] = await Promise.all([
            liveService.getGroupsWithProgress(activeSession.id),
            liveService.getTimeline(activeSession.id),
          ])
          setGroups(groupsData)
          setTimeline(timelineData)
        } catch {
          // silent
        }
      }
      runTick()
      simulationRef.current = window.setInterval(runTick, 12000)
    } else {
      if (simulationRef.current) {
        clearInterval(simulationRef.current)
        simulationRef.current = null
      }
    }
    return () => {
      if (simulationRef.current) clearInterval(simulationRef.current)
    }
  }, [simulationOn, activeSession])

  const handleSessionChange = (newId: string) => {
    navigate(`/admin/live/${newId}`)
  }

  const handleConfirm = async (groupId: string, action: 'skip' | 'jump' | 'reset', reason: string, targetStageId?: string) => {
    if (!activeSession || !user) return
    try {
      if (action === 'skip') {
        const progress = groups.find((g) => g.group.id === groupId)?.progress
        const active = progress?.find(
          (p) => p.status === GroupStageProgressStatus.IN_PROGRESS || p.status === GroupStageProgressStatus.UNLOCKED
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
        user.id
      )
      await fetchData()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin()
        return
      }
    }
    setOverrideModal(null)
  }

  const handleUnlock = async (groupId: string, sessionStageId: string) => {
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
        user.id
      )
      await fetchData()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) redirectToLogin()
    }
  }

  const handleComplete = async (groupId: string, sessionStageId: string) => {
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
        user.id
      )
      await fetchData()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) redirectToLogin()
    }
  }

  const getGroupStatus = (g: LiveGroupWithProgress) => {
    if (g.progress.length === 0) {
      return { status: 'LOCKED' as const, stageId: undefined }
    }

    const active = g.progress.find(
      (p) => p.status === GroupStageProgressStatus.IN_PROGRESS
    )
    if (active) return { status: 'IN_PROGRESS' as const, stageId: active.session_stage_id }

    const unlocked = g.progress.find(
      (p) => p.status === GroupStageProgressStatus.UNLOCKED
    )
    if (unlocked) return { status: 'UNLOCKED' as const, stageId: unlocked.session_stage_id }

    const allDone = g.progress.every(
      (p) => p.status === GroupStageProgressStatus.COMPLETED || p.status === GroupStageProgressStatus.SKIPPED
    )
    if (allDone) return { status: 'COMPLETED' as const, stageId: undefined }

    const hasDone = g.progress.some(
      (p) => p.status === GroupStageProgressStatus.COMPLETED || p.status === GroupStageProgressStatus.SKIPPED
    )
    if (hasDone) return { status: 'COMPLETED' as const, stageId: undefined }

    return { status: 'LOCKED' as const, stageId: undefined }
  }

  const getActiveStageIndex = (g: LiveGroupWithProgress) => {
    const activeProgress = g.progress.find(
      (p) => p.status === GroupStageProgressStatus.IN_PROGRESS || p.status === GroupStageProgressStatus.UNLOCKED
    )
    if (!activeProgress) return { current: 0, total: programStages.length }

    const ss = stages.find((s) => s.id === activeProgress.session_stage_id)
    const ps = programStages.find((p) => p.id === ss?.program_stage_id)

    return {
      current: ps?.sequence_order ?? 0,
      total: programStages.length,
    }
  }

  const getNextLockedStageId = (g: LiveGroupWithProgress): string | undefined => {
    const sorted = [...g.progress].sort((a, b) => {
      const sa = stages.find((s) => s.id === a.session_stage_id)
      const sb = stages.find((s) => s.id === b.session_stage_id)
      const pa = programStages.find((p) => p.id === sa?.program_stage_id)
      const pb = programStages.find((p) => p.id === sb?.program_stage_id)
      return (pa?.sequence_order ?? 0) - (pb?.sequence_order ?? 0)
    })
    return sorted.find((p) => p.status === GroupStageProgressStatus.LOCKED)?.session_stage_id
  }

  // ── Loading ──
  if (loading) {
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

  // ── Error ──
  if (error) {
    return (
      <ErrorState
        title="Gagal Memuat"
        message={error}
        action={{ label: 'Coba Lagi', onClick: fetchData }}
      />
    )
  }

  // ── No active session ──
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

  // `allCompleted` = semua stage COMPLETED/SKIPPED (cek record langsung, bukan derived status)
  const allCompleted = groups.length > 0 && groups.every(
    (g) => g.progress.length > 0 && g.progress.every(
      (p) => p.status === GroupStageProgressStatus.COMPLETED || p.status === GroupStageProgressStatus.SKIPPED
    )
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <PageHeader
            title="Live Monitor"
            subtitle={activeSession.name}
          />
          <div className="flex items-center gap-4 mt-2 text-sm text-on-surface-variant">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {activeSession.session_date}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {activeSession.location}
            </span>
            {groups.some((g) => {
              const { status } = getGroupStatus(g)
              return status === 'IN_PROGRESS' || status === 'UNLOCKED'
            }) && (
              <Badge variant="success">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Live
                </span>
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {allActiveSessions.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-on-surface-variant font-medium">Sesi:</label>
              <select
                value={activeSession?.id || ''}
                onChange={(e) => handleSessionChange(e.target.value)}
                className="px-3 py-1.5 rounded-xl border text-sm bg-surface-container-low border-outline-variant/60 text-on-surface"
              >
                {allActiveSessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} — {s.session_date}</option>
                ))}
              </select>
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const activeGroup = groups.find(g => {
                const { status } = getGroupStatus(g)
                return status === 'IN_PROGRESS' || status === 'UNLOCKED'
              })
              if (activeGroup && activeSession) {
                const { stageId } = getGroupStatus(activeGroup)
                if (stageId) {
                  window.open(`/learner/${activeSession.id}/${stageId}`, '_blank')
                }
              }
            }}
            disabled={!groups.some(g => {
              const { status } = getGroupStatus(g)
              return status === 'IN_PROGRESS' || status === 'UNLOCKED'
            })}
          >
            <Monitor className="w-4 h-4 mr-1" />
            Buka Kiosk
          </Button>
          <Button
            variant={simulationOn ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setSimulationOn(!simulationOn)}
          >
            <Play className="w-4 h-4 mr-1" />
            {simulationOn ? 'Hentikan Simulasi' : 'Mulai Simulasi'}
          </Button>
          <Button variant="ghost" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Completion celebration */}
      {allCompleted && (
        <div className="bg-success-container text-on-success-container rounded-xl p-6 text-center">
          <h2 className="text-xl font-bold">🎉 Semua kelompok selesai!</h2>
          <p className="mt-1">Sesi telah berakhir. Semua kelompok telah menyelesaikan semua stage.</p>
        </div>
      )}

      {/* Stats summary */}
      {groups.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: groups.length, icon: Users, color: 'text-on-surface' },
            { label: 'Selesai', value: groups.filter((g) => g.progress.length > 0 && g.progress.every((p) => p.status === GroupStageProgressStatus.COMPLETED || p.status === GroupStageProgressStatus.SKIPPED)).length, icon: CheckCircle2, color: 'text-green-600' },
            { label: 'Berlangsung', value: groups.filter((g) => { const s = getGroupStatus(g).status; return s === 'IN_PROGRESS' || s === 'UNLOCKED' }).length, icon: Play, color: 'text-amber-600' },
            { label: 'Menunggu', value: groups.filter((g) => getGroupStatus(g).status === 'LOCKED').length, icon: Monitor, color: 'text-gray-500' },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface rounded-xl p-4 border border-outline-variant/40">
              <div className="flex items-center gap-2 text-on-surface-variant text-sm mb-1">
                <stat.icon className="w-4 h-4" />
                <span>{stat.label}</span>
              </div>
              <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Groups grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(() => {
          const sortedGroups = [...groups].sort((a, b) => {
            const order = { IN_PROGRESS: 0, UNLOCKED: 1, COMPLETED: 2, LOCKED: 3 }
            const sa = getGroupStatus(a).status
            const sb = getGroupStatus(b).status
            return (order[sa] ?? 4) - (order[sb] ?? 4)
          })
          return sortedGroups.map((g) => {
          const { status, stageId } = getGroupStatus(g)
          const activeIdx = getActiveStageIndex(g)
          const statusConfig = {
            IN_PROGRESS: { label: '🟡 SEDANG', variant: 'warning' as const },
            UNLOCKED: { label: '🟢 SIAP', variant: 'primary' as const },
            COMPLETED: { label: '✅ SELESAI', variant: 'success' as const },
            LOCKED: { label: '🔒 TERKUNCI', variant: 'neutral' as const },
          }
          const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.LOCKED

          return (
            <div
              key={g.group.id}
              className={cn(
                'bg-surface rounded-xl p-5 border transition-all',
                status === 'IN_PROGRESS' ? 'border-amber-300 shadow-md' :
                status === 'COMPLETED' ? 'border-green-200' :
                'border-outline-variant'
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-on-surface text-lg">{g.group.name}</h3>
                <Badge variant={config.variant}>{config.label}</Badge>
              </div>

              {/* Progress */}
              <StageProgressBar
                stages={g.progress.map((p) => {
                  const ss = stages.find((s) => s.id === p.session_stage_id)
                  const ps = programStages.find((pp) => pp.id === ss?.program_stage_id)
                  return {
                    id: p.session_stage_id,
                    name: stageNames[p.session_stage_id] || ps?.name || 'Stage',
                    sequenceOrder: ps?.sequence_order ?? 0,
                    status: p.status,
                  }
                })}
              />

              {/* Info */}
              <div className="flex items-center justify-between mt-4 text-sm">
                <span className="text-on-surface-variant">
                  🎯 {stageNames[stageId || ''] || '-'}
                </span>
                <span className="text-on-surface-variant font-medium">
                  Stage {activeIdx.current}/{activeIdx.total}
                </span>
              </div>

              {/* Participants */}
              <div className="flex items-center gap-1 mt-2 text-sm text-on-surface-variant">
                <Users className="w-4 h-4" />
                <span>{g.participants.length} anak</span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                {status === 'IN_PROGRESS' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleComplete(g.group.id, stageId!)}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Selesai
                  </Button>
                )}
                {status === 'COMPLETED' && !allCompleted && (() => {
                  const nextLockedId = getNextLockedStageId(g)
                  return nextLockedId ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleUnlock(g.group.id, nextLockedId)}
                    >
                      Konfirmasi Pindah
                    </Button>
                  ) : null
                })()}
                {isKoordinator && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setOverrideModal({ groupId: g.group.id, action: 'skip' })}
                    >
                      <SkipForward className="w-4 h-4 mr-1" />
                      Skip
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setOverrideModal({ groupId: g.group.id, action: 'jump' })}
                    >
                      Jump
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setOverrideModal({ groupId: g.group.id, action: 'reset' })}
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Reset
                    </Button>
                  </div>
                )}
              </div>

              {/* Duration warning */}
              {status === 'IN_PROGRESS' && (() => {
                const activeProgress = g.progress.find(
                  (p) => p.status === GroupStageProgressStatus.IN_PROGRESS
                )
                if (activeProgress?.entered_at) {
                  const elapsed = Date.now() - new Date(activeProgress.entered_at).getTime()
                  if (elapsed > 30 * 60 * 1000) {
                    return (
                      <div className="flex items-center gap-1 mt-3 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>⚠️ Melebihi durasi standar</span>
                      </div>
                    )
                  }
                }
                return null
              })()}
            </div>
          )
          })
        })()}
      </div>

      {/* Timeline */}
      <div className="bg-surface rounded-xl p-5 border border-outline-variant">
        <h3 className="font-semibold text-on-surface mb-4">Timeline Aktivitas</h3>
        <TimelineFeed events={timeline} />
      </div>

      {/* Override modal */}
      {overrideModal && (
        <ConfirmOverrideModal
          open={true}
          actionType={overrideModal.action}
          availableStages={stages.map((s) => ({
            value: s.id,
            label: stageNames[s.id] || s.id,
          }))}
          onConfirm={(reason, targetStageId) =>
            handleConfirm(overrideModal.groupId, overrideModal.action, reason, targetStageId)
          }
          onClose={() => setOverrideModal(null)}
        />
      )}
    </div>
  )
}

export default LiveMonitorPage
