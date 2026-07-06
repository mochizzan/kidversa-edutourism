import { type ReactNode } from 'react'
import { AlertTriangle, Camera, Mic } from 'lucide-react'
import { cn } from '../../../core/utils'

interface ConsentGateProps {
  consentType: 'recording' | 'photo'
  childName: string
  hasConsent: boolean
  onBack?: () => void
  children?: ReactNode
  className?: string
}

const consentConfig = {
  recording: {
    icon: Mic,
    title: 'Izin Rekaman Diperlukan',
    description:
      'Orang tua/wali belum memberikan izin untuk merekam aktivitas',
    detail:
      'Rekaman suara dan video tidak dapat dilakukan tanpa persetujuan dari orang tua atau wali.',
  },
  photo: {
    icon: Camera,
    title: 'Izin Foto Diperlukan',
    description: 'Orang tua/wali belum memberikan izin untuk mengambil foto',
    detail:
      'Pengambilan foto tidak dapat dilakukan tanpa persetujuan dari orang tua atau wali.',
  },
} as const

export function ConsentGate({
  consentType,
  childName,
  hasConsent,
  onBack,
  children,
  className,
}: ConsentGateProps) {
  if (hasConsent) {
    return <>{children}</>
  }

  const cfg = consentConfig[consentType]
  const Icon = cfg.icon

  return (
    <div
      className={cn(
        'flex flex-col items-center text-center py-10 px-6',
        className
      )}
    >
      <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
      </div>

      <div className="max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Icon className="w-5 h-5 text-amber-500 shrink-0" />
          <h3 className="text-lg font-semibold text-on-surface">
            {cfg.title}
          </h3>
        </div>

        <p className="text-sm text-on-surface-variant mb-1">
          {cfg.description}{' '}
          <span className="font-medium text-on-surface">{childName}</span>.
        </p>

        <p className="text-xs text-on-surface-variant mb-8">
          {cfg.detail}
        </p>

        {onBack && (
          <button
            onClick={onBack}
            className="px-6 py-2.5 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Kembali
          </button>
        )}
      </div>
    </div>
  )
}
