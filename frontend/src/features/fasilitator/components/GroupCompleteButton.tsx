import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'
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
              Semua sudah dinilai
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-yellow-600">
              <AlertTriangle className="w-4 h-4" />
              {assessedCount}/{totalChildren} sudah dinilai
            </span>
          )}
        </span>
        <span className="text-xs text-on-surface-variant/60">
          {remaining > 0 ? `${remaining} tersisa` : ''}
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
            Memproses...
          </>
        ) : (
          <>
            <CheckCircle className="w-5 h-5" />
            {allAssessed ? 'Selesaikan Kelompok' : 'Nilai Semua Peserta Terlebih Dahulu'}
          </>
        )}
      </button>

      {!allAssessed && remaining > 0 && (
        <p className="text-xs text-center text-yellow-600">
          Semua peserta harus dinilai sebelum kelompok dapat diselesaikan
        </p>
      )}
    </div>
  )
}
