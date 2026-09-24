import { Lock, Unlock, ArrowRight, CheckCircle2, AlertTriangle, Users, Flag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '../../../shared/components/ui/Badge'
import { Button } from '../../../shared/components/ui/Button'
import { cn } from '../../../core/utils'
import { GroupStageProgressStatus } from '../../../core/types/enums'
import { StageProgressBar } from './StageProgressBar'
import { parentStageId, siblingSubstages } from '../../../core/utils/substage'
import type { GroupStatus } from '../hooks/useLiveMonitor'
import type { LiveGroupWithProgress } from '../../../core/services/live'
import type { SessionStage, ProgramStage, SessionSubstage } from '../../../core/types'

interface LiveGroupCardProps {
  group: LiveGroupWithProgress
  status: GroupStatus
  stageId?: string
  activeIndex: { current: number; total: number }
  stages: SessionStage[]
  programStages: ProgramStage[]
  stageNames: Record<string, string>
  isKoordinator: boolean
  nextLockedStageId?: string
  sessionSubstages: SessionSubstage[]
  onComplete: (groupId: string, stageId: string) => void
  onUnlock: (groupId: string, stageId: string) => void
  onLock: (groupId: string) => void
  onCompleteKegiatan: (sessionSubstageId: string) => void
}

const statusConfig = {
  LOCKED: { labelKey: 'admin.sessions.stageLocked', variant: 'neutral' },
  UNLOCKED: { labelKey: 'admin.sessions.unlockedLabel', variant: 'primary' },
  IN_PROGRESS: { labelKey: 'admin.sessions.stageInProgress', variant: 'warning' },
  COMPLETED: { labelKey: 'common.done', variant: 'success' },
} as const satisfies Record<GroupStatus, { labelKey: string; variant: 'warning' | 'primary' | 'success' | 'neutral' }>

export const LiveGroupCard = ({
  group: g,
  status,
  stageId,
  activeIndex,
  stages,
  programStages,
  stageNames,
  isKoordinator,
  nextLockedStageId,
  sessionSubstages,
  onComplete,
  onUnlock,
  onLock,
  onCompleteKegiatan,
}: LiveGroupCardProps) => {
  const { t } = useTranslation()
  // stageId is a Kegiatan id (C3), so the SubTopik's leaves are its siblings —
  // the helper resolves up to the parent SubTopik and returns them in order.
  const kegiatanForStage = siblingSubstages(sessionSubstages, stageId)
  const activeStageId = parentStageId(sessionSubstages, stageId)
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
            <span>⚠️ {t('admin.sessions.durationExceeded')}</span>
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
        <Badge variant={config.variant}>{t(config.labelKey)}</Badge>
      </div>

      <StageProgressBar
        stages={g.progress.map((p) => {
          // Progress rows are Kegiatan-level: resolve up for the SubTopik name
          // and order, but keep the Kegiatan id as identity — several Kegiatan
          // share one SubTopik and a duplicated key would drop segments.
          const parentId = parentStageId(sessionSubstages, p.session_substage_id)
          const ss = stages.find((s) => s.id === parentId)
          const ps = programStages.find((pp) => pp.id === ss?.program_stage_id)
          return {
            id: p.session_substage_id,
            name: stageNames[parentId || ''] || ps?.name || t('admin.col.topic'),
            sequenceOrder: ps?.sequence_order ?? 0,
            status: p.status,
          }
        })}
      />

      <div className="flex items-center justify-between mt-4 text-sm">
        <span className="text-on-surface-variant">🎯 {stageNames[activeStageId || ''] || '-'}</span>
        <span className="text-on-surface-variant font-medium">
          {t('admin.sessions.topicProgress', { current: activeIndex.current, total: activeIndex.total })}
        </span>
      </div>

      <div className="flex items-center gap-1 mt-2 text-sm text-on-surface-variant">
        <Users className="w-4 h-4" />
        <span>{t('admin.sessions.childCount', { count: g.participants.length })}</span>
      </div>

      {kegiatanForStage.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide">{t('admin.sessions.kegiatanHeading')}</p>
          {kegiatanForStage.map((k, idx) => {
            const done = k.status === 'COMPLETED'
            return (
              <div
                key={k.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-surface-variant px-3 py-2"
              >
                <span className="text-sm text-on-surface truncate">
                  {done ? '✅' : '⏳'} {t('admin.sessions.kegiatanN', { n: idx + 1 })}
                </span>
                {!done && isKoordinator && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onCompleteKegiatan(k.id)}
                    icon={<Flag className="w-3.5 h-3.5" />}
                  >
                    {t('admin.sessions.finishKegiatan')}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2 mt-4 flex-wrap">
        {status === 'LOCKED' && stageId && (
          <Button variant="primary" size="sm" onClick={() => onUnlock(g.group.id, stageId)}>
            <Unlock className="w-4 h-4 mr-1" />
            {t('admin.sessions.openContent')}
          </Button>
        )}
        {status === 'IN_PROGRESS' && (
          <Button variant="primary" size="sm" onClick={() => onComplete(g.group.id, stageId!)}>
            <CheckCircle2 className="w-4 h-4 mr-1" />
            {t('common.done')}
          </Button>
        )}
        {status === 'UNLOCKED' || status === 'IN_PROGRESS' ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => onLock(g.group.id)}>
              <Lock className="w-4 h-4 mr-1" />
              {t('admin.sessions.lockContent')}
            </Button>
            {nextLockedStageId && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onUnlock(g.group.id, nextLockedStageId)}
              >
                <ArrowRight className="w-4 h-4 mr-1" />
                {t('admin.sessions.nextTopic')}
              </Button>
            )}
          </>
        ) : null}
      </div>

      {durationWarning}
    </div>
  )
}
