import { Users, ChevronRight } from 'lucide-react'
import { cn } from '../../../core/utils'
import { Badge } from '../../../shared/components/ui/Badge'

interface GroupCardProps {
  name: string
  childCount: number
  currentStage?: string
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED'
  onClick?: () => void
  className?: string
}

const statusConfig: Record<string, { label: string; variant: 'warning' | 'accent' | 'success' }> = {
  WAITING: { label: 'Menunggu', variant: 'warning' },
  IN_PROGRESS: { label: 'Sedang Berlangsung', variant: 'accent' },
  COMPLETED: { label: 'Selesai', variant: 'success' },
}

export function GroupCard({ name, childCount, currentStage, status, onClick, className }: GroupCardProps) {
  const config = statusConfig[status] ?? { label: status, variant: 'neutral' as const }

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left bg-surface rounded-2xl p-5 shadow-sm border border-outline-variant/50',
        'hover:border-primary/30 hover:shadow-md hover:bg-surface-container-low/50',
        'transition-all duration-200 group',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-on-surface text-base group-hover:text-primary transition-colors">
            {name}
          </h3>
          {currentStage && (
            <p className="text-sm text-on-surface-variant mt-0.5">
              {currentStage}
            </p>
          )}
        </div>
        <Badge variant={config.variant}>{config.label}</Badge>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm text-on-surface-variant">
          <Users className="w-4 h-4 shrink-0" />
          <span>{childCount} peserta</span>
        </div>
        <div className="flex items-center gap-1 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          <span>Buka</span>
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </button>
  )
}
