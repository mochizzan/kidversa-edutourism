import { useState } from 'react'
import { Users, ChevronRight, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../core/utils'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'

interface GroupCardProps {
  name: string
  childCount: number
  currentStage?: string
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED'
  /** Server-computed ownership (is_owner) from the groups list endpoint. */
  isOwner?: boolean
  /** Group owner; fallback ownership signal when isOwner is absent. */
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

// Unknown/legacy status values from the API must never crash the card
// (statusConfig[status] would otherwise be undefined → config.x throws).
const unknownStatusConfig = { labelKey: null, variant: 'neutral' } as const

export function GroupCard({
  name,
  childCount,
  currentStage,
  status,
  isOwner,
  facilitatorId,
  currentUserId,
  onClick,
  className,
}: GroupCardProps) {
  const { t } = useTranslation()
  const [showLockedInfo, setShowLockedInfo] = useState(false)
  const config = statusConfig[status] ?? unknownStatusConfig
  // Prefer the server flag; fall back to the client-side facilitator match so
  // callers without is_owner keep working.
  const isMine = typeof isOwner === 'boolean'
    ? isOwner
    : !!currentUserId && facilitatorId === currentUserId
  const safeChildCount =
    typeof childCount === 'number' && Number.isFinite(childCount) && childCount > 0
      ? Math.floor(childCount)
      : 0
  const displayName = typeof name === 'string' && name.trim() !== '' ? name : t('fasilitator.group.fallbackName')

  const handleClick = () => {
    // Non-owned cards never navigate: they open an explanatory modal instead.
    if (!isMine) {
      setShowLockedInfo(true)
      return
    }
    onClick?.()
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-haspopup="dialog"
        className={cn(
          'w-full text-left bg-surface rounded-2xl p-5 shadow-sm border border-outline-variant/50',
          'transition-all duration-200 group',
          isMine
            ? 'hover:border-primary/30 hover:shadow-md hover:bg-surface-container-low/50 cursor-pointer'
            : 'opacity-60 grayscale border-dashed',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-on-surface text-base group-hover:text-primary transition-colors">
                {displayName}
              </h3>
              {isMine ? (
                <Badge variant="accent" size="sm" className="shrink-0">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  {t('fasilitator.galeri.ownedBadge')}
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
          <Badge variant={config.variant}>
            {config.labelKey ? t(config.labelKey) : String(status ?? '')}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm text-on-surface-variant">
            <Users className="w-4 h-4 shrink-0" />
            <span>{t('fasilitator.group.participantCount', { count: safeChildCount })}</span>
          </div>
          {isMine && (
            <div className="flex items-center gap-1 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              <span>{t('fasilitator.group.open')}</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          )}
        </div>
      </button>

      {/* Explains why a non-owned card cannot be entered — replaces the old
          silent early-return / disabled button (keyboard-accessible, no nav). */}
      <Modal
        open={showLockedInfo}
        onClose={() => setShowLockedInfo(false)}
        title={t('fasilitator.notMyGroup')}
        size="sm"
      >
        <p className="text-sm text-on-surface-variant">{t('fasilitator.galeri.lockedGroupDesc')}</p>
      </Modal>
    </>
  )
}
