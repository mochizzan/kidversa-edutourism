import { Badge } from '../ui/Badge'
import { cn } from '../../../core/utils'

interface SessionData {
  id: string
  name: string
  programName: string
  date: string
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  participantCount: number
  completionRate: number
}

interface RecentSessionsProps {
  sessions: SessionData[]
  title: string
  className?: string
}

const statusConfig: Record<
  string,
  { label: string; variant: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  DRAFT: { label: 'Draf', variant: 'neutral' },
  ACTIVE: { label: 'Aktif', variant: 'success' },
  COMPLETED: { label: 'Selesai', variant: 'primary' },
  CANCELLED: { label: 'Dibatalkan', variant: 'danger' },
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function CompletionBar({ rate }: { rate: number }) {
  const getColor = (rate: number) => {
    if (rate >= 80) return 'bg-green-500'
    if (rate >= 50) return 'bg-yellow-500'
    if (rate > 0) return 'bg-orange-500'
    return 'bg-gray-300'
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', getColor(rate))}
          style={{ width: `${rate}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{rate}%</span>
    </div>
  )
}

export function RecentSessions({
  sessions,
  title,
  className,
}: RecentSessionsProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-gray-200 p-6',
        className
      )}
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                Sesi
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                Tanggal
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                Status
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                Peserta
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                Progres
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sessions.map((session) => {
              const status = statusConfig[session.status]

              return (
                <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3">
                    <p className="text-sm font-medium text-gray-900">
                      {session.name}
                    </p>
                    <p className="text-xs text-gray-500">{session.programName}</p>
                  </td>
                  <td className="py-3">
                    <span className="text-sm text-gray-600">
                      {formatDate(session.date)}
                    </span>
                  </td>
                  <td className="py-3">
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </td>
                  <td className="py-3">
                    <span className="text-sm text-gray-600">
                      {session.participantCount}
                    </span>
                  </td>
                  <td className="py-3">
                    <CompletionBar rate={session.completionRate} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
