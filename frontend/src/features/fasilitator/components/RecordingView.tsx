import { RefObject } from 'react'
import { X, Square, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { cn } from '../../../core/utils'
import type { RecorderCameraState } from '../hooks/useMediaRecorder'

interface RecordingViewProps {
  videoRef: RefObject<HTMLVideoElement | null>
  cameraState: RecorderCameraState
  recordingFailed: boolean
  retryCount: number
  maxRetries: number
  timer: number
  maxDuration: number
  formatTime: (seconds: number) => string
  onStop: () => void
  onCancel: () => void
  onSwitchCamera: () => void
  onRetry: () => void
  onBack: () => void
}

export const RecordingView = ({
  videoRef,
  cameraState,
  recordingFailed,
  retryCount,
  maxRetries,
  timer,
  maxDuration,
  formatTime,
  onStop,
  onCancel,
  onSwitchCamera,
  onRetry,
  onBack,
}: RecordingViewProps) => (
  <div className="flex-1 relative">
    {cameraState === 'loading' && (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-white" />
          <p className="text-sm text-white/70">Mengakses kamera...</p>
        </div>
      </div>
    )}

    {recordingFailed && (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 bg-surface text-on-surface text-center">
        <AlertTriangle className="w-16 h-16 text-error" />
        <h3 className="font-semibold text-lg">Rekaman Gagal</h3>
        <p className="text-sm text-on-surface-variant">
          Terjadi kesalahan saat merekam.
          {retryCount < maxRetries
            ? ` Silakan coba lagi (${retryCount}/${maxRetries}).`
            : ' Batas percobaan tercapai.'}
        </p>
        {retryCount < maxRetries ? (
          <Button onClick={onRetry} icon={<RotateCcw className="w-4 h-4" />}>
            Coba Lagi
          </Button>
        ) : (
          <Button variant="secondary" onClick={onBack}>
            Kembali
          </Button>
        )}
      </div>
    )}

    {cameraState === 'active' && !recordingFailed && (
      <>
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 rounded-full px-4 py-1.5 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
          <span className="text-lg font-mono font-bold tracking-wider">{formatTime(timer)}</span>
        </div>

        <div className="absolute top-16 left-4 right-4">
          <div className="w-full bg-white/20 rounded-full h-1.5 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-1000 ease-linear',
                timer <= 5 ? 'bg-error' : 'bg-primary',
              )}
              style={{ width: `${((maxDuration - timer) / maxDuration) * 100}%` }}
            />
          </div>
        </div>

        {timer <= 5 && timer > 0 && (
          <div className="absolute inset-0 border-[6px] border-error rounded-2xl animate-pulse pointer-events-none" />
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-6 pb-8 pt-12">
          <div className="flex items-center justify-center gap-6">
            <button onClick={onCancel} className="flex flex-col items-center gap-1 text-white/70">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <X className="w-5 h-5" />
              </div>
              <span className="text-[10px]">Batal</span>
            </button>

            <button
              onClick={onStop}
              className="w-16 h-16 rounded-full bg-white flex items-center justify-center active:scale-95 transition-transform"
            >
              <Square className="w-7 h-7 text-error fill-error" />
            </button>

            <button onClick={onSwitchCamera} className="flex flex-col items-center gap-1 text-white/70">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                  />
                </svg>
              </div>
              <span className="text-[10px]">Ganti</span>
            </button>

            <div className="w-16" />
          </div>
          <p className="text-center text-xs text-white/50 mt-2">
            Tekan Selesai untuk mengakhiri rekaman
          </p>
        </div>
      </>
    )}
  </div>
)
