import { Clock, MapPin } from 'lucide-react'
import { cn } from '../../../core/utils'
import { Badge } from '../../../shared/components/ui/Badge'
import { formatDate } from '../../../shared/utils'
import type { Session } from '../../../core/types'

interface SessionCardProps {
  session: Session
  timeRange?: string
  onClick?: () => void
  className?: string
}

const statusVariant: Record<string, 'success' | 'warning' | 'primary' | 'neutral' | 'danger'> = {
  ACTIVE: 'success',
  COMPLETED: 'primary',
  DRAFT: 'neutral',
  CANCELLED: 'neutral',
}

const statusLabel: Record<string, string> = {
  ACTIVE: 'Aktif',
  COMPLETED: 'Selesai',
  DRAFT: 'Draf',
  CANCELLED: 'Dibatalkan',
}

export function SessionCard({ session, timeRange = '08:00 - 12:00', onClick, className }: SessionCardProps) {
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
        <h3 className="font-semibold text-on-surface text-base leading-snug group-hover:text-primary transition-colors">
          {session.name}
        </h3>
        <Badge variant={statusVariant[session.status] ?? 'neutral'}>
          {statusLabel[session.status] ?? session.status}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-on-surface-variant">
        <div className="flex items-center gap-1.5">
          <Clock className="w-4 h-4 shrink-0" />
          <span>{timeRange}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="w-4 h-4 shrink-0" />
          <span>{session.location}</span>
        </div>
      </div>

      <p className="mt-1.5 text-xs text-on-surface-variant/60">
        {formatDate(session.session_date)}
      </p>
    </button>
  )
}
