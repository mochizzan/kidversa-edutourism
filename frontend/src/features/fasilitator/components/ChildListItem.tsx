import { Star, Camera, Video } from 'lucide-react'
import { cn } from '../../../core/utils'

interface ChildListItemProps {
  name: string
  age: number
  school?: string
  isAssessed: boolean
  showPhoto?: boolean
  showRecording?: boolean
  onAssess?: () => void
  onPhoto?: () => void
  onRecording?: () => void
  className?: string
}

export function ChildListItem({
  name,
  age,
  school,
  isAssessed,
  showPhoto = false,
  showRecording = false,
  onAssess,
  onPhoto,
  onRecording,
  className,
}: ChildListItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 bg-surface rounded-2xl p-4 shadow-sm border border-outline-variant/50',
        'min-h-[56px]',
        className,
      )}
    >
      {/* Avatar */}
      <div className="w-10 h-10 shrink-0 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-sm">
        {name.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-on-surface text-sm">{name}</span>
          <span className="text-xs text-on-surface-variant">{age} tahun</span>
        </div>
        {school && (
          <p className="text-xs text-on-surface-variant/70 mt-0.5">{school}</p>
        )}
        <div className="mt-1.5">
          {isAssessed ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              <Star className="w-3 h-3 fill-current" />
              Sudah dinilai
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
              <Star className="w-3 h-3" />
              Belum dinilai
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {onAssess && (
          <button
            onClick={(e) => { e.stopPropagation(); onAssess() }}
            className={cn(
              'flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-colors min-h-[40px] min-w-[48px]',
              isAssessed
                ? 'bg-primary-container text-on-primary-container hover:bg-primary-container/80'
                : 'bg-primary text-white hover:bg-primary-dark',
            )}
          >
            <Star className="w-4 h-4" />
            <span className="hidden sm:inline">Nilai</span>
          </button>
        )}
        {showPhoto && onPhoto && (
          <button
            onClick={(e) => { e.stopPropagation(); onPhoto() }}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors"
            aria-label="Ambil Foto"
          >
            <Camera className="w-4 h-4" />
          </button>
        )}
        {showRecording && onRecording && (
          <button
            onClick={(e) => { e.stopPropagation(); onRecording() }}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors"
            aria-label="Rekam Video"
          >
            <Video className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
