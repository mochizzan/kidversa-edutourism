import { useState } from 'react'
import { ChevronLeft, ChevronRight, Heart } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { cn } from '../../../core/utils'

interface SessionCardData {
  id: string
  name: string
  programName: string
  status: string
  statusLabel: string
  image: string
  mentor: string
  mentorAvatar: string
  isSaved: boolean
}

interface SessionCarouselProps {
  sessions: SessionCardData[]
}

function SessionCard({ session }: { session: SessionCardData }) {
  const [saved, setSaved] = useState(session.isSaved)

  return (
    <div className="min-w-[220px] flex-1 bg-surface rounded-2xl p-3 shadow-sm group snap-start transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <div className="relative rounded-xl overflow-hidden aspect-[16/10] mb-3">
        <div className={cn('w-full h-full transition-transform duration-300 group-hover:scale-105', session.image)} />
        <button
          onClick={() => setSaved(!saved)}
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-surface/90 flex items-center justify-center"
        >
          <Heart className={cn('w-4 h-4', saved ? 'fill-error text-error' : 'text-on-surface-variant')} />
        </button>
      </div>
      <Badge variant={session.status === 'ACTIVE' ? 'primary' : session.status === 'COMPLETED' ? 'success' : 'neutral'}>
        {session.statusLabel}
      </Badge>
      <h3 className="text-sm font-bold text-on-surface leading-snug mb-3 mt-2 line-clamp-2">{session.name}</h3>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container text-[10px] font-bold">
          {session.mentor.charAt(0)}
        </div>
        <p className="text-xs font-semibold text-on-surface">{session.mentor}</p>
        <span className="text-[10px] text-on-surface-variant ml-auto">Fasilitator</span>
      </div>
    </div>
  )
}

export function SessionCarousel({ sessions }: SessionCarouselProps) {
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 3
  const totalPages = Math.ceil(sessions.length / PAGE_SIZE)
  const visibleSessions = sessions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-on-surface">Sesi Terbaru</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            className="w-8 h-8 rounded-full border border-outline bg-surface/50 flex items-center justify-center text-on-surface-variant hover:text-on-surface"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="w-8 h-8 rounded-full bg-primary text-on-primary text-xs flex items-center justify-center font-bold">
            {page + 1}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            className="w-8 h-8 rounded-full bg-surface shadow-sm flex items-center justify-center text-primary hover:bg-surface-container"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2">
        {visibleSessions.map((session) => (
          <SessionCard key={session.id} session={session} />
        ))}
      </div>
    </div>
  )
}
