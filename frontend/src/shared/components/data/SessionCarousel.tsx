import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, MapPin, Users } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { cn } from '../../../core/utils'
import { formatDate } from '../../utils'

interface SessionCardData {
  id: string
  name: string
  programName: string
  status: string
  statusLabel: string
  image?: string
  sessionDate?: string
  location?: string
  participantCount?: number
  mentor?: string
  mentorAvatar?: string
}

interface SessionCarouselProps {
  sessions: SessionCardData[]
  title?: string
}

function SessionCard({ session }: { session: SessionCardData }) {
  const navigate = useNavigate()
  const isActive = session.status === 'ACTIVE'
  const isCompleted = session.status === 'COMPLETED'

  const statusStyles = isActive
    ? {
        accent: 'bg-success-container text-success',
        panel: 'bg-success/10',
      }
    : isCompleted
      ? {
          accent: 'bg-primary-container text-primary',
          panel: 'bg-primary/10',
        }
      : {
          accent: 'bg-surface-container-high text-on-surface-variant',
          panel: 'bg-surface-container-low',
        }

  return (
    <button
      onClick={() => navigate(`/admin/sessions/${session.id}`)}
      className={cn(
        'min-w-[280px] flex-1 rounded-2xl border border-outline-variant/60 bg-surface p-4 text-left shadow-sm group snap-start',
        'transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md hover:bg-surface-container-low/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105',
              statusStyles.accent,
            )}
          >
            <CalendarDays className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <h3 className="text-base font-bold text-on-surface leading-snug line-clamp-2">
              {session.name}
            </h3>
            <p className="mt-1 text-sm text-on-surface-variant line-clamp-1">
              {session.programName}
            </p>
          </div>
        </div>

        <Badge variant={isActive ? 'success' : isCompleted ? 'primary' : 'neutral'}>
          {session.statusLabel}
        </Badge>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-on-surface-variant sm:grid-cols-2">
        {session.sessionDate && (
          <div className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5', statusStyles.panel)}>
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{formatDate(session.sessionDate)}</span>
          </div>
        )}

        {session.location && (
          <div className="flex items-center gap-1.5 rounded-full bg-surface-container-low px-3 py-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{session.location}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 rounded-full bg-surface-container-low px-3 py-1.5 sm:col-span-2">
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span>
            {session.participantCount ?? 0} peserta
          </span>
        </div>
      </div>

      {session.mentor && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-surface-container-low px-3 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-container text-[10px] font-bold text-on-primary-container">
            {session.mentor.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-on-surface truncate">{session.mentor}</p>
            <span className="text-[10px] text-on-surface-variant">Fasilitator</span>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-sm font-medium text-primary">
        <span>Buka detail sesi</span>
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      </div>
    </button>
  )
}

export function SessionCarousel({ sessions, title = 'Sesi Aktif' }: SessionCarouselProps) {
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 3
  const totalPages = Math.ceil(sessions.length / PAGE_SIZE)
  const visibleSessions = sessions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (sessions.length === 0) return null

  return (
    <div className="overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-on-surface">{title}</h2>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="w-8 h-8 rounded-full border border-outline bg-surface/50 flex items-center justify-center text-on-surface-variant hover:text-on-surface disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="w-8 h-8 rounded-full bg-primary text-on-primary text-xs flex items-center justify-center font-bold">
              {page + 1}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="w-8 h-8 rounded-full bg-surface shadow-sm flex items-center justify-center text-primary hover:bg-surface-container disabled:opacity-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      <div className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2">
        {visibleSessions.map((session) => (
          <SessionCard key={session.id} session={session} />
        ))}
      </div>
    </div>
  )
}
