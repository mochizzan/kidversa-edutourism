import {
  Play,
  Users,
  FileText,
  CheckCircle,
  Calendar,
} from 'lucide-react'
import { cn } from '../../../core/utils'

interface ActivityItem {
  id: string
  type:
    | 'session_created'
    | 'session_started'
    | 'session_completed'
    | 'report_sent'
    | 'participant_added'
    | 'stage_completed'
  title: string
  description: string
  timestamp: string
  icon: string
  color: string
}

interface ActivityFeedProps {
  activities: ActivityItem[]
  title: string
  maxItems?: number
  className?: string
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Play,
  Users,
  FileText,
  CheckCircle,
  Calendar,
}

function formatRelativeTime(timestamp: string): string {
  const now = new Date()
  const date = new Date(timestamp)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Baru saja'
  if (diffMins < 60) return `${diffMins} menit lalu`
  if (diffHours < 24) return `${diffHours} jam lalu`
  if (diffDays < 7) return `${diffDays} hari lalu`
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

export function ActivityFeed({
  activities,
  title,
  maxItems = 5,
  className,
}: ActivityFeedProps) {
  const displayActivities = activities.slice(0, maxItems)

  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-gray-200 p-6',
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <button className="text-sm text-primary hover:text-primary-dark font-medium transition-colors">
          Lihat Semua
        </button>
      </div>

      <div className="space-y-4">
        {displayActivities.map((activity, index) => {
          const Icon = iconMap[activity.icon] || Calendar

          return (
            <div
              key={activity.id}
              className={cn(
                'flex items-start gap-3',
                index < displayActivities.length - 1 && 'pb-4 border-b border-gray-100'
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0',
                  activity.color
                )}
              >
                <Icon className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {activity.title}
                </p>
                <p className="text-sm text-gray-500 truncate">
                  {activity.description}
                </p>
              </div>

              <span className="text-xs text-gray-400 whitespace-nowrap">
                {formatRelativeTime(activity.timestamp)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
