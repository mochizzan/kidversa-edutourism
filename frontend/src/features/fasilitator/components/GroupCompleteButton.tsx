import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../core/utils'

interface GroupCompleteButtonProps {
  totalChildren: number
  assessedCount: number
  onComplete: () => void
  loading?: boolean
  disabled?: boolean
  className?: string
}

export function GroupCompleteButton({
  totalChildren,
  assessedCount,
  onComplete,
  loading = false,
  disabled = false,
  className,
}: GroupCompleteButtonProps) {
  const { t } = useTranslation()
  const allAssessed = totalChildren > 0 && assessedCount >= totalChildren
  const remaining = totalChildren - assessedCount

  return (
    <div className={cn('space-y-3', className)}>
      {/* Progress indicator */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-on-surface-variant">
          {allAssessed ? (
            <span className="flex items-center gap-1.5 text-green-600 font-medium">
              <CheckCircle className="w-4 h-4" />
              {t('fasilitator.group.allAssessed')}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-yellow-600">
              <AlertTriangle className="w-4 h-4" />
              {t('fasilitator.group.assessedProgress', { assessed: assessedCount, total: totalChildren })}
            </span>
          )}
        </span>
        <span className="text-xs text-on-surface-variant/60">
          {remaining > 0 ? t('fasilitator.group.remainingCount', { count: remaining }) : ''}
        </span>
      </div>

      {/* Complete button */}
      <button
        onClick={onComplete}
        disabled={!allAssessed || loading || disabled}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-base transition-all duration-200',
          'min-h-[52px]',
          allAssessed && !disabled
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
            <CheckCircle className="w-5 h-5" />
            {allAssessed ? t('fasilitator.group.complete') : t('fasilitator.group.rateAllFirst')}
          </>
        )}
      </button>

      {!allAssessed && remaining > 0 && (
        <p className="text-xs text-center text-yellow-600">
          {t('fasilitator.group.completeHint')}
        </p>
      )}
    </div>
  )
}
