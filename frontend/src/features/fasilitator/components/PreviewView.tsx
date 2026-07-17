import { RefObject } from 'react'
import { Play, Square, Save, RotateCcw, AlertTriangle } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'

interface PreviewViewProps {
  previewVideoRef: RefObject<HTMLVideoElement | null>
  recordedBlob: Blob | null
  isPreviewPlaying: boolean
  isSaving: boolean
  timer: number
  maxDuration: number
  formatTime: (seconds: number) => string
  onTogglePreview: () => void
  onRetake: () => void
  onSave: () => void
  onPreviewEnded: () => void
}

export const PreviewView = ({
  previewVideoRef,
  recordedBlob,
  isPreviewPlaying,
  isSaving,
  timer,
  maxDuration,
  formatTime,
  onTogglePreview,
  onRetake,
  onSave,
  onPreviewEnded,
}: PreviewViewProps) => (
  <div className="flex-1 flex flex-col bg-surface text-on-surface">
    <div className="flex-1 bg-black flex items-center justify-center relative">
      {recordedBlob ? (
        <video
          ref={previewVideoRef}
          controls
          className="max-w-full max-h-full"
          onEnded={onPreviewEnded}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-white/50">
          <AlertTriangle className="w-8 h-8" />
          <p className="text-sm">Rekaman tidak tersedia</p>
        </div>
      )}

      {recordedBlob && (
        <div className="absolute top-3 left-3 bg-black/70 rounded-full px-3 py-1 text-xs font-mono">
          {formatTime(Math.max(1, maxDuration - timer))}
        </div>
      )}
    </div>

    <div className="shrink-0 px-6 py-4 border-t border-outline-variant space-y-3">
      {recordedBlob && (
        <Button
          variant="secondary"
          className="w-full"
          icon={isPreviewPlaying ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          onClick={onTogglePreview}
        >
          {isPreviewPlaying ? 'Berhenti' : 'Preview'}
        </Button>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          className="flex-1"
          icon={<RotateCcw className="w-4 h-4" />}
          onClick={onRetake}
        >
          Rekam Ulang
        </Button>
        <Button
          className="flex-1"
          loading={isSaving}
          icon={<Save className="w-4 h-4" />}
          onClick={onSave}
          disabled={!recordedBlob}
        >
          Simpan
        </Button>
      </div>
    </div>
  </div>
)
