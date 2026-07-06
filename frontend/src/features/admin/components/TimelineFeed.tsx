import { useEffect, useRef } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Unlock,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '../../../core/utils'
import type { TimelineEventRow } from '../../../core/services/live'

interface TimelineFeedProps {
  events: TimelineEventRow[]
  loading?: boolean
  className?: string
}

const typeConfig: Record<
  TimelineEventRow['type'],
  { dotColor: string; bgColor: string; icon: React.ReactNode }
> = {
  'group:progress': {
    dotColor: 'bg-blue-500',
    bgColor: 'bg-blue-100',
    icon: <ArrowRight className="w-3 h-3 text-blue-600" />,
  },
  'group:completed': {
    dotColor: 'bg-green-500',
    bgColor: 'bg-green-100',
    icon: <CheckCircle2 className="w-3 h-3 text-green-600" />,
  },
  'stage:unlock': {
    dotColor: 'bg-amber-500',
    bgColor: 'bg-amber-100',
    icon: <Unlock className="w-3 h-3 text-amber-600" />,
  },
  override: {
    dotColor: 'bg-red-500',
    bgColor: 'bg-red-100',
    icon: <AlertTriangle className="w-3 h-3 text-red-600" />,
  },
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString)
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  }).format(date)
}

function SkeletonLine({ widthClass }: { widthClass: string }) {
  return (
    <div className="flex items-start gap-3 animate-pulse">
      <div className="flex flex-col items-center gap-1">
        <div className="w-3 h-3 rounded-full bg-gray-200 shrink-0" />
        <div className="flex-1 w-px bg-gray-100 min-h-[32px]" />
      </div>
      <div className="flex-1 pb-4 space-y-1.5">
        <div className={cn('h-3 bg-gray-200 rounded', widthClass)} />
        <div className="h-2.5 bg-gray-100 rounded w-2/3" />
      </div>
    </div>
  )
}

export function TimelineFeed({ events, loading, className }: TimelineFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevLengthRef = useRef(events.length)

  // Auto-scroll to latest (first) event when new events arrive
  useEffect(() => {
    if (events.length > prevLengthRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
    prevLengthRef.current = events.length
  }, [events.length])

  // Loading skeleton (6 skeleton events)
  if (loading) {
    return (
      <div className={cn('space-y-0', className)}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonLine
            key={i}
            widthClass={i % 2 === 0 ? 'w-3/4' : 'w-1/2'}
          />
        ))}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-8 text-center', className)}>
        <ArrowRight className="w-8 h-8 text-gray-300 mb-2" />
        <p className="text-sm text-gray-400">Belum ada aktivitas</p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className={cn('space-y-0 overflow-y-auto max-h-[480px] pr-1', className)}>
      {events.map((event, idx) => {
        const config = typeConfig[event.type]
        const isLast = idx === events.length - 1
        return (
          <div key={event.id} className="flex items-start gap-3">
            {/* Timeline dot + line */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                  config.bgColor
                )}
              >
                {config.icon}
              </div>
              {!isLast && (
                <div className="flex-1 w-px bg-gray-200 min-h-[24px]" />
              )}
            </div>

            {/* Content */}
            <div className={cn('flex-1 pb-4', isLast && 'pb-0')}>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400 font-mono whitespace-nowrap">
                  {formatTimestamp(event.created_at)}
                </span>
                <div className={cn('w-1.5 h-1.5 rounded-full', config.dotColor)} />
              </div>
              <p className="text-sm text-gray-700 mt-0.5 leading-snug">
                {event.message}
              </p>
              {event.user_id && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  oleh user ID: {event.user_id}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
