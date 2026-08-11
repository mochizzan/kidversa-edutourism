import { Users } from 'lucide-react'

interface SessionParticipation {
  name: string
  count: number
}

interface TopSessionsProps {
  data: SessionParticipation[]
  title?: string
}

export function TopSessions({ data, title = 'Partisipasi per Sesi' }: TopSessionsProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 1)

  return (
    <div className="bg-surface rounded-3xl p-6 shadow-sm">
      <h2 className="text-lg font-bold text-on-surface mb-4">{title}</h2>
      {data.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-4">Belum ada sesi aktif.</p>
      ) : (
        <div className="space-y-2">
          {data.map((item) => {
            const pct = (item.count / maxCount) * 100
            return (
              <div key={item.name} className="flex items-center gap-3 rounded-2xl bg-surface-container-low p-3">
                <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-medium text-on-surface flex-1 truncate min-w-0">
                  {item.name}
                </span>
                <div className="w-24 bg-surface-container-high rounded-full h-2 overflow-hidden shrink-0">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-on-surface-variant w-12 text-right shrink-0">{item.count}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
