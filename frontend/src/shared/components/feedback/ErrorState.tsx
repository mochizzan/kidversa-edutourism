import { AlertCircle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../core/utils'

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function ErrorState({
  title,
  message,
  onRetry,
  action,
  className,
}: ErrorStateProps) {
  const { t } = useTranslation()
  const buttonLabel = action?.label ?? t('common.error.retry')
  const handleClick = action?.onClick ?? onRetry

  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)}>
      <AlertCircle className="w-12 h-12 text-error mb-4" />
      <h3 className="text-lg font-semibold text-on-surface mb-1">{title ?? t('common.error.title')}</h3>
      <p className="text-sm text-on-surface-variant max-w-sm mb-4">{message ?? t('common.error.message')}</p>
      {handleClick && (
        <button
          onClick={handleClick}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          {buttonLabel}
        </button>
      )}
    </div>
  )
}
