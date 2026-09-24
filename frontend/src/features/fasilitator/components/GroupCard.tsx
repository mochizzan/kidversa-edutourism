import { Users, ChevronRight, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../core/utils'
import { Badge } from '../../../shared/components/ui/Badge'

interface GroupCardProps {
  name: string
  childCount: number
  currentStage?: string
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED'
  /** Group owner; when it matches currentUserId the "Tugas Saya" badge shows. */
  facilitatorId?: string
  currentUserId?: string
  onClick?: () => void
  className?: string
}

const statusConfig = {
  WAITING: { labelKey: 'fasilitator.status.waiting', variant: 'warning' },
  IN_PROGRESS: { labelKey: 'fasilitator.status.inProgress', variant: 'accent' },
  COMPLETED: { labelKey: 'fasilitator.status.completed', variant: 'success' },
} as const

export function GroupCard({
  name,
  childCount,
  currentStage,
  status,
  facilitatorId,
  currentUserId,
  onClick,
  className,
}: GroupCardProps) {
  const { t } = useTranslation()
  const config = statusConfig[status]
  const isMine = !!currentUserId && facilitatorId === currentUserId

  const handleClick = () => {
    if (!isMine) return
    onClick?.()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isMine}
      aria-disabled={!isMine}
      className={cn(
        'w-full text-left bg-surface rounded-2xl p-5 shadow-sm border border-outline-variant/50',
        'transition-all duration-200 group',
        isMine
          ? 'hover:border-primary/30 hover:shadow-md hover:bg-surface-container-low/50 cursor-pointer'
          : 'opacity-60 grayscale cursor-not-allowed border-dashed',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-on-surface text-base group-hover:text-primary transition-colors">
              {name}
            </h3>
            {isMine ? (
              <Badge variant="accent" size="sm" className="shrink-0">
                <CheckCircle className="w-3 h-3 mr-1" />
                {t('fasilitator.myTask')}
              </Badge>
            ) : (
              <Badge variant="neutral" size="sm" className="shrink-0">
                {t('fasilitator.notMyGroup')}
              </Badge>
            )}
          </div>
          {currentStage && (
            <p className="text-sm text-on-surface-variant mt-0.5">
              {currentStage}
            </p>
          )}
        </div>
        <Badge variant={config.variant}>{t(config.labelKey)}</Badge>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm text-on-surface-variant">
          <Users className="w-4 h-4 shrink-0" />
          <span>{t('fasilitator.group.participantCount', { count: childCount })}</span>
        </div>
        {isMine && (
          <div className="flex items-center gap-1 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            <span>{t('fasilitator.group.open')}</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        )}
      </div>
    </button>
  )
}
