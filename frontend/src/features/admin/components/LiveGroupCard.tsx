import { SkipForward, RotateCcw, CheckCircle2, AlertTriangle, Users } from 'lucide-react'
import { Badge } from '../../../shared/components/ui/Badge'
import { Button } from '../../../shared/components/ui/Button'
import { cn } from '../../../core/utils'
import { GroupStageProgressStatus } from '../../../core/types/enums'
import { StageProgressBar } from './StageProgressBar'
import type { GroupStatus } from '../hooks/useLiveMonitor'
import type { LiveGroupWithProgress } from '../../../core/services/live'
import type { SessionStage, ProgramStage } from '../../../core/types'

interface LiveGroupCardProps {
  group: LiveGroupWithProgress
  status: GroupStatus
  stageId?: string
  activeIndex: { current: number; total: number }
  stages: SessionStage[]
  programStages: ProgramStage[]
  stageNames: Record<string, string>
  isKoordinator: boolean
  allCompleted: boolean
  nextLockedStageId?: string
  onComplete: (groupId: string, stageId: string) => void
  onUnlock: (groupId: string, stageId: string) => void
  onOverride: (groupId: string, action: 'skip' | 'jump' | 'reset') => void
}

const statusConfig: Record<GroupStatus, { label: string; variant: 'warning' | 'primary' | 'success' | 'neutral' }> = {
  IN_PROGRESS: { label: '🟡 SEDANG', variant: 'warning' },
  UNLOCKED: { label: '🟢 SIAP', variant: 'primary' },
  COMPLETED: { label: '✅ SELESAI', variant: 'success' },
  LOCKED: { label: '🔒 TERKUNCI', variant: 'neutral' },
}

export const LiveGroupCard = ({
  group: g,
  status,
  stageId,
  activeIndex,
  stages,
  programStages,
  stageNames,
  isKoordinator,
  allCompleted,
  nextLockedStageId,
  onComplete,
  onUnlock,
  onOverride,
}: LiveGroupCardProps) => {
  const config = statusConfig[status] || statusConfig.LOCKED

  const durationWarning = (() => {
    if (status !== 'IN_PROGRESS') return null
    const activeProgress = g.progress.find(
      (p) => p.status === GroupStageProgressStatus.IN_PROGRESS,
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
  })()

  return (
    <div
      className={cn(
        'bg-surface rounded-xl p-5 border transition-all',
        status === 'IN_PROGRESS'
          ? 'border-amber-300 shadow-md'
          : status === 'COMPLETED'
            ? 'border-green-200'
            : 'border-outline-variant',
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-on-surface text-lg">{g.group.name}</h3>
        <Badge variant={config.variant}>{config.label}</Badge>
      </div>

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

      <div className="flex items-center justify-between mt-4 text-sm">
        <span className="text-on-surface-variant">🎯 {stageNames[stageId || ''] || '-'}</span>
        <span className="text-on-surface-variant font-medium">
          Stage {activeIndex.current}/{activeIndex.total}
        </span>
      </div>

      <div className="flex items-center gap-1 mt-2 text-sm text-on-surface-variant">
        <Users className="w-4 h-4" />
        <span>{g.participants.length} anak</span>
      </div>

      <div className="flex items-center gap-2 mt-4 flex-wrap">
        {status === 'IN_PROGRESS' && (
          <Button variant="primary" size="sm" onClick={() => onComplete(g.group.id, stageId!)}>
            <CheckCircle2 className="w-4 h-4 mr-1" />
            Selesai
          </Button>
        )}
        {status === 'COMPLETED' && !allCompleted && nextLockedStageId && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onUnlock(g.group.id, nextLockedStageId)}
          >
            Konfirmasi Pindah
          </Button>
        )}
        {isKoordinator && (
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" onClick={() => onOverride(g.group.id, 'skip')}>
              <SkipForward className="w-4 h-4 mr-1" />
              Skip
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onOverride(g.group.id, 'jump')}>
              Jump
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onOverride(g.group.id, 'reset')}>
              <RotateCcw className="w-4 h-4 mr-1" />
              Reset
            </Button>
          </div>
        )}
      </div>

      {durationWarning}
    </div>
  )
}
