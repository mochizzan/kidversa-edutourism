import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../core/utils'

interface GroupCompleteButtonProps {
  /** Locked completion rule (see evaluateGroupCompletion). */
  canComplete: boolean
  /** Present participants that are fully assessed (progress numerator). */
  assessedCount: number
  /** Present participants (progress denominator — absentees excluded). */
  presentCount: number
  /** Present participants still missing assessment (blockers). */
  remainingCount: number
  onComplete: () => void
  loading?: boolean
  disabled?: boolean
  className?: string
}

export function GroupCompleteButton({
  canComplete,
  assessedCount,
  presentCount,
  remainingCount,
  onComplete,
  loading = false,
  disabled = false,
  className,
}: GroupCompleteButtonProps) {
  const { t } = useTranslation()

  return (
    <div className={cn('space-y-3', className)}>
      {/* Progress indicator */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-on-surface-variant">
          {canComplete ? (
            <span className="flex items-center gap-1.5 text-green-600 font-medium">
              <CheckCircle className="w-4 h-4" />
              {t('fasilitator.group.allAssessed')}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-yellow-600">
              <AlertTriangle className="w-4 h-4" />
              {t('fasilitator.group.assessedProgress', { assessed: assessedCount, total: presentCount })}
            </span>
          )}
        </span>
        <span className="text-xs text-on-surface-variant/60">
          {remainingCount > 0 ? t('fasilitator.group.remainingCount', { count: remainingCount }) : ''}
        </span>
      </div>

      {/* Complete button */}
      <button
        onClick={onComplete}
        disabled={!canComplete || loading || disabled}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-base transition-all duration-200',
          'min-h-[52px]',
          canComplete && !disabled
            ? 'bg-primary text-white hover:bg-primary-dark shadow-sm hover:shadow-md'
            : 'bg-surface-container-high text-on-surface-variant/50 cursor-not-allowed',
          loading && 'opacity-70',
        )}
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {t('common.processing')}
          </>
        ) : (
          <>
            {canComplete ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
            {canComplete ? t('fasilitator.group.complete') : t('fasilitator.group.rateAllFirst')}
          </>
        )}
      </button>

      {!canComplete && remainingCount > 0 && (
        <p className="text-xs text-center text-yellow-600">
          {t('fasilitator.group.completeHint')}
        </p>
      )}
    </div>
  )
}
