import { useMemo } from 'react'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../core/utils'
import { getMediaUrl } from '../../../core/utils/media'
import { imageFallbackSrc } from '../../../core/constants/app'
import { filterFramesForProgram } from '../utils/frameFilter'
import type { PhotoFrame } from '../../../core/types'

interface FramePickerProps {
  frames: PhotoFrame[]
  /** Program that owns this picker — frames of other programs are never shown. */
  programId?: string
  selectedFrameId: string | null
  onSelect: (frameId: string | null) => void
}

export const FramePicker = ({ frames, programId, selectedFrameId, onSelect }: FramePickerProps) => {
  const { t } = useTranslation()
  const visibleFrames = useMemo(
    () => filterFramesForProgram(frames, programId),
    [frames, programId],
  )
  return (
    <div className="grid grid-cols-3 gap-3">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          'aspect-square rounded-xl border-2 flex items-center justify-center text-xs font-semibold relative transition-all',
          selectedFrameId === null
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-outline-variant text-on-surface-variant hover:border-on-surface',
        )}
      >
        {t('fasilitator.frame.none')}
        {selectedFrameId === null && (
          <div className="absolute -top-1.5 -right-1.5 bg-primary text-white rounded-full p-0.5 shadow-sm">
            <Check className="w-3.5 h-3.5" />
          </div>
        )}
      </button>
      {visibleFrames.length === 0 && (
        <div
          className="col-span-3 rounded-xl border-2 border-dashed border-outline-variant px-4 py-6 text-center text-xs text-on-surface-variant"
        >
          {t('fasilitator.frame.empty')}
        </div>
      )}
      {visibleFrames.map((frame) => (
        <button
          key={frame.id}
          onClick={() => onSelect(frame.id)}
          className={cn(
            'aspect-square rounded-xl overflow-hidden border-2 relative transition-all',
            selectedFrameId === frame.id
              ? 'border-primary scale-105 shadow-md'
              : 'border-transparent hover:border-white/30',
          )}
        >
          {frame.thumbnail_url || frame.file_url ? (
            <img
              src={getMediaUrl('frame', frame.id)}
              alt={frame.name}
              className="w-full h-full object-contain"
              onError={(e) => {
                ; (e.target as HTMLImageElement).src = imageFallbackSrc()
              }}
            />
          ) : (
            <div className="w-full h-full bg-white/20 flex items-center justify-center text-[8px] text-white/50">
              {frame.name}
            </div>
          )}
          {selectedFrameId === frame.id && (
            <div className="absolute -top-1.5 -right-1.5 bg-primary text-white rounded-full p-0.5 shadow-sm">
              <Check className="w-3.5 h-3.5" />
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
