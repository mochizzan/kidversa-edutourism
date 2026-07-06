import { AlertCircle, RefreshCw } from 'lucide-react'
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
  title = 'Terjadi Kesalahan',
  message = 'Terjadi kesalahan saat memuat data. Silakan coba lagi.',
  onRetry,
  action,
  className,
}: ErrorStateProps) {
  const buttonLabel = action?.label ?? 'Coba Lagi'
  const handleClick = action?.onClick ?? onRetry

  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)}>
      <AlertCircle className="w-12 h-12 text-error mb-4" />
      <h3 className="text-lg font-semibold text-on-surface mb-1">{title}</h3>
      <p className="text-sm text-on-surface-variant max-w-sm mb-4">{message}</p>
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
