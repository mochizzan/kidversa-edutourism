import { RefObject } from 'react'
import {
  Camera,
  AlertTriangle,
  ChevronDown,
  Monitor,
  Zap,
  RefreshCw,
  LayoutGrid,
  Image,
} from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { cn } from '../../../core/utils'
import { CircleControlBtn } from './CircleControlBtn'
import type { CameraState } from '../hooks/useCamera'
import type { Participant } from '../../../core/types'

interface CameraViewportProps {
  videoRef: RefObject<HTMLVideoElement | null>
  cameraState: CameraState
  showGrid: boolean
  pageError: string | null
  onRetryLoad: () => void
  participant: Participant
  isMobile: boolean
  isDesktop: boolean
  devices: MediaDeviceInfo[]
  selectedDeviceId: string
  currentCameraLabel: string
  cameraPickerOpen: boolean
  onToggleCameraPicker: () => void
  onCloseCameraPicker: () => void
  onDeviceChange: (deviceId: string) => void
  onSwitchCamera: () => void
  onToggleGrid: () => void
  photoCount: number
  maxPhotos: number
  isMaxPhotos: boolean
  onTakePhoto: () => void
  onOpenGallery: () => void
  onOpenFramePicker: () => void
}

export const CameraViewport = ({
  videoRef,
  cameraState,
  showGrid,
  pageError,
  onRetryLoad,
  participant,
  isMobile,
  isDesktop,
  devices,
  selectedDeviceId,
  currentCameraLabel,
  cameraPickerOpen,
  onToggleCameraPicker,
  onCloseCameraPicker,
  onDeviceChange,
  onSwitchCamera,
  onToggleGrid,
  photoCount,
  maxPhotos,
  isMaxPhotos,
  onTakePhoto,
  onOpenGallery,
  onOpenFramePicker,
}: CameraViewportProps) => (
  <>
    {pageError && (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 bg-on-surface text-white z-10">
        <AlertTriangle className="w-16 h-16 text-accent" />
        <p className="text-sm text-white/70 text-center max-w-[280px]">{pageError}</p>
        <Button variant="secondary" onClick={onRetryLoad}>
          Coba Lagi
        </Button>
      </div>
    )}

    {cameraState === 'loading' && (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-on-surface text-white z-10">
        <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
        <p className="text-sm text-white/60">Mengakses kamera...</p>
      </div>
    )}

    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={cn(
        'absolute inset-0 w-full h-full object-cover object-center z-0',
        cameraState === 'active' ? 'opacity-100' : 'opacity-0',
      )}
    />

    {cameraState === 'active' && showGrid && (
      <div className="absolute inset-0 z-[5] pointer-events-none">
        <div className="absolute top-0 left-1/3 w-px h-full bg-white/30" />
        <div className="absolute top-0 left-2/3 w-px h-full bg-white/30" />
        <div className="absolute top-1/3 left-0 h-px w-full bg-white/30" />
        <div className="absolute top-2/3 left-0 h-px w-full bg-white/30" />
      </div>
    )}

    {cameraState !== 'loading' && (
      <div className="absolute top-4 left-4 z-10 backdrop-blur-md bg-white/15 border border-white/20 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg">
        {participant.child_name || 'Siti Aminah'} ({participant.child_age || '5'} thn)
      </div>
    )}

    {(cameraState === 'denied' || cameraState === 'error') && (
      <div className="absolute top-14 left-4 z-10 flex items-center gap-1.5 backdrop-blur-md bg-error/20 border border-error/30 text-white/90 px-3 py-1 rounded-full text-[10px] font-bold shadow-lg">
        <AlertTriangle className="w-3 h-3" />
        Kamera Error
      </div>
    )}

    {cameraState !== 'loading' && isDesktop && devices.length > 0 && (
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={onToggleCameraPicker}
          className="flex items-center gap-2 backdrop-blur-md bg-white/15 border border-white/20 text-white text-xs font-bold px-3.5 py-1.5 rounded-full shadow-lg hover:bg-white/25 transition-all"
        >
          <Camera className="w-3.5 h-3.5 text-white/90" />
          <span className="max-w-[120px] truncate">{currentCameraLabel}</span>
          <ChevronDown className="w-3 h-3 text-white/70" />
        </button>

        {cameraPickerOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={onCloseCameraPicker} />
            <div className="absolute right-0 top-full mt-2 w-64 bg-white text-slate-800 rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50">
              <div className="p-1.5 space-y-1">
                <button
                  onClick={() => {
                    onDeviceChange('')
                    onCloseCameraPicker()
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all text-xs font-bold',
                    !selectedDeviceId
                      ? 'bg-primary-container text-primary'
                      : 'hover:bg-surface-container-low text-on-surface',
                  )}
                >
                  <Camera className="w-4 h-4 text-primary" />
                  <span>Otomatis</span>
                </button>
                {devices.map((device) => {
                  const isSelected = selectedDeviceId === device.deviceId
                  return (
                    <button
                      key={device.deviceId}
                      onClick={() => {
                        onDeviceChange(device.deviceId)
                        onCloseCameraPicker()
                      }}
                      className={cn(
                        'w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all text-xs font-bold truncate',
                        isSelected
                          ? 'bg-primary-container text-primary'
                          : 'hover:bg-surface-container-low text-on-surface',
                      )}
                    >
                      <Monitor className="w-4 h-4 text-on-surface-variant" />
                      <span className="truncate">{device.label || 'Kamera'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    )}

    {cameraState !== 'loading' && isMobile && (
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-4">
        <CircleControlBtn icon={Zap} label="Flash" onClick={() => {}} />
        <CircleControlBtn icon={RefreshCw} label="Balik" onClick={onSwitchCamera} />
        <CircleControlBtn icon={LayoutGrid} label="Grid" onClick={onToggleGrid} active={showGrid} />
      </div>
    )}

    {cameraState !== 'loading' && (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[90%] md:w-[70%] max-w-md backdrop-blur-md bg-black/50 border border-white/15 rounded-full px-5 py-3 flex items-center justify-between gap-4 shadow-lg">
        <button
          onClick={onOpenGallery}
          className="flex items-center gap-1.5 text-xs font-extrabold text-white/80 hover:text-white transition-colors"
        >
          <Image className="w-3.5 h-3.5" />
          <span>
            {photoCount}/{maxPhotos}
          </span>
        </button>

        <button
          onClick={onTakePhoto}
          disabled={isMaxPhotos || cameraState !== 'active'}
          className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-90 transition-all flex-shrink-0 relative group"
        >
          <div className="absolute inset-[3px] rounded-full border-2 border-primary/30 group-hover:border-primary/50 transition-all" />
          <Camera className="w-6 h-6 text-primary" />
        </button>

        <button
          onClick={onOpenFramePicker}
          className="flex items-center gap-1.5 text-xs font-extrabold text-white/80 hover:text-white transition-colors"
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          Frame
        </button>
      </div>
    )}
  </>
)
