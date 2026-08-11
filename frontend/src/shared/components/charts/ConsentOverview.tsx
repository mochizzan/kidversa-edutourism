import { ShieldCheck, Camera } from 'lucide-react'

interface ConsentOverviewProps {
  recordingConsented: number
  photoConsented: number
  total: number
  title?: string
}

export function ConsentOverview({
  recordingConsented,
  photoConsented,
  total,
  title = 'Status Persetujuan',
}: ConsentOverviewProps) {
  const recordingPct = total > 0 ? (recordingConsented / total) * 100 : 0
  const photoPct = total > 0 ? (photoConsented / total) * 100 : 0

  return (
    <div className="bg-surface rounded-3xl p-6 shadow-sm">
      <h2 className="text-lg font-bold text-on-surface mb-4">{title}</h2>
      {total === 0 ? (
        <p className="text-sm text-on-surface-variant py-4">Belum ada peserta.</p>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-on-surface">Konsent Recording</span>
              </div>
              <span className="text-sm font-bold text-on-surface">{recordingPct.toFixed(0)}%</span>
            </div>
            <div className="bg-surface-container-low rounded-full h-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${recordingPct}%` }}
              />
            </div>
            <p className="text-xs text-on-surface-variant mt-1">{recordingConsented} dari {total} peserta</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-on-surface">Konsent Foto</span>
              </div>
              <span className="text-sm font-bold text-on-surface">{photoPct.toFixed(0)}%</span>
            </div>
            <div className="bg-surface-container-low rounded-full h-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${photoPct}%` }}
              />
            </div>
            <p className="text-xs text-on-surface-variant mt-1">{photoConsented} dari {total} peserta</p>
          </div>
        </div>
      )}
    </div>
  )
}
