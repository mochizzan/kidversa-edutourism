import { Clock, MapPin, CheckCircle, CalendarDays } from 'lucide-react'
import { cn } from '../../../core/utils'
import { Badge } from '../../../shared/components/ui/Badge'
import { formatDate } from '../../../shared/utils'
import type { Session } from '../../../core/types'

interface SessionCardProps {
  session: Session
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

export function SessionCard({ session, onClick, className }: SessionCardProps) {
  const isMySession = session.is_my_session === true
  const hasTime = session.start_time != null && session.end_time != null
  const timeDisplay = hasTime
    ? `${session.start_time!.slice(0, 5)} – ${session.end_time!.slice(0, 5)}`
    : 'Sepanjang hari'

  return (
    <button
      onClick={isMySession ? onClick : undefined}
      disabled={!isMySession}
      className={cn(
        'w-full text-left bg-surface rounded-2xl p-5 shadow-sm border',
        isMySession
          ? 'border-primary/30 hover:border-primary/50 hover:shadow-md hover:bg-surface-container-low/50 cursor-pointer'
          : 'border-outline-variant/50 cursor-default',
        'transition-all duration-200 group',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className={cn(
            'font-semibold text-base leading-snug truncate',
            isMySession ? 'text-primary group-hover:text-primary-dark' : 'text-on-surface',
          )}>
            {session.name}
          </h3>
          {isMySession && (
            <Badge variant="accent" size="sm" className="shrink-0">
              <CheckCircle className="w-3 h-3 mr-1" />
              Tugas Saya
            </Badge>
          )}
        </div>
        <Badge variant={statusVariant[session.status] ?? 'neutral'}>
          {statusLabel[session.status] ?? session.status}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-on-surface-variant">
        <div className="flex items-center gap-1.5">
          {hasTime ? (
            <Clock className="w-4 h-4 shrink-0" />
          ) : (
            <CalendarDays className="w-4 h-4 shrink-0" />
          )}
          <span>{timeDisplay}</span>
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
