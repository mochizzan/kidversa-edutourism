import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Camera, AlertTriangle, ChevronLeft, Lock } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Modal } from '../../../shared/components/ui/Modal'
import { getMediaUrl } from '../../../core/utils/media'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { ConfirmDialog } from '../../../shared/components/feedback/ConfirmDialog'
import { frameService } from '../../../core/services/frames'
import { sessionService } from '../../../core/services/sessions'
import { useAuthStore } from '../../../core/stores/authStore'
import { useCamera } from '../hooks/useCamera'
import { useSmartPhotos } from '../hooks/useSmartPhotos'
import { useGroupOwnership } from '../hooks/useGroupOwnership'
import { CameraViewport } from '../components/CameraViewport'
import { PhotoEditor } from '../components/PhotoEditor'
import { PhotoGallery, FullscreenPhoto } from '../components/PhotoGallery'
import { FramePicker } from '../components/FramePicker'
import type { SmartPhoto, PhotoFrame, Participant } from '../../../core/types'

const MAX_PHOTOS = 10

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img')
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

const SmartPhotoPage = () => {
  const { childId } = useParams<{ groupId: string; childId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { addToast } = useGlobalToast()
  const { isMine } = useGroupOwnership(childId)

  const captureCanvasRef = useRef<HTMLCanvasElement>(null)
  const editorCanvasRef = useRef<HTMLCanvasElement>(null)

  const [phase, setPhase] = useState<'camera' | 'editor' | 'gallery'>('camera')
  const [pageError, setPageError] = useState<string | null>(null)
  const [cameraPickerOpen, setCameraPickerOpen] = useState(false)
  const [showGrid, setShowGrid] = useState(false)

  const [isMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 1024)
  const [isDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth > 1024)

  const [frames, setFrames] = useState<PhotoFrame[]>([])
  const [activeFrames, setActiveFrames] = useState<PhotoFrame[]>([])
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null)
  const [capturedPhotoDataUrl, setCapturedPhotoDataUrl] = useState<string | null>(null)

  const [isReportPhoto, setIsReportPhoto] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [fullscreenPhoto, setFullscreenPhoto] = useState<SmartPhoto | null>(null)
  const [confirmDeletePhoto, setConfirmDeletePhoto] = useState(false)
  const [framePickerOpen, setFramePickerOpen] = useState(false)

  const [participant, setParticipant] = useState<Participant | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const loadCancelledRef = useRef(false)

  const {
    videoRef,
    streamRef,
    cameraState,
    devices,
    selectedDeviceId,
    facingMode,
    switchCamera,
    selectDevice,
    restartCamera,
  } = useCamera({ enabled: phase === 'camera' && !!participant?.consent_photo })

  const { photos, loadPhotos, deletePhoto, uploadPhoto } = useSmartPhotos(childId)

  const loadParticipant = useCallback(async () => {
    if (!childId) return
    loadCancelledRef.current = false
    try {
      const part = await sessionService.getParticipantById(childId)
      if (!loadCancelledRef.current) setParticipant(part)
    } catch {
      if (!loadCancelledRef.current) setParticipant(null)
    } finally {
      if (!loadCancelledRef.current) setDataLoading(false)
    }
  }, [childId])

  useEffect(() => {
    if (!childId) {
      setDataLoading(false)
      return
    }
    loadCancelledRef.current = false
    loadParticipant()
    return () => {
      loadCancelledRef.current = true
    }
  }, [loadParticipant])

  const loadInitialData = useCallback(() => {
    frameService
      .getAll({ page: 1, limit: 100 })
      .then((res) => {
        setFrames(res.data)
        setActiveFrames(res.data.filter((f) => f.is_active))
      })
      .catch(() => {
        setPageError('Gagal memuat data frame. Periksa koneksi lalu coba lagi.')
      })
    if (childId) {
      loadPhotos().catch(() => {
        setPageError('Gagal memuat data foto. Periksa koneksi lalu coba lagi.')
      })
    }
  }, [childId, loadPhotos])

  useEffect(() => {
    loadInitialData()
  }, [childId, loadInitialData])

  useEffect(() => {
    if (phase !== 'editor' || !capturedPhotoDataUrl || !editorCanvasRef.current) return
    const canvas = editorCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let cancelled = false
    const draw = async () => {
      const img = await loadImage(capturedPhotoDataUrl)
      if (cancelled) return
      canvas.width = img.width
      canvas.height = img.height
      ctx.drawImage(img, 0, 0)
      if (selectedFrameId) {
        const frame = frames.find((f) => f.id === selectedFrameId)
        if (frame?.file_url) {
          try {
            const frameImg = await loadImage(
              getMediaUrl('frame', frame.id),
            )
            if (!cancelled) ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height)
          } catch {
            // ignore
          }
        }
      }
    }
    draw()
    return () => {
      cancelled = true
    }
  }, [phase, capturedPhotoDataUrl, selectedFrameId, frames])

  const takePhoto = useCallback(() => {
    if (!videoRef.current || !captureCanvasRef.current || !user || !isMine) return
    const video = videoRef.current
    const canvas = captureCanvasRef.current
    const isPortrait = window.innerWidth <= 1024

    let captureWidth: number
    let captureHeight: number

    if (isPortrait) {
      captureHeight = video.videoHeight
      captureWidth = Math.round(video.videoHeight * (9 / 16))
      if (captureWidth > video.videoWidth) {
        captureWidth = video.videoWidth
        captureHeight = Math.round(video.videoWidth * (16 / 9))
      }
    } else {
      captureWidth = video.videoWidth
      captureHeight = Math.round(video.videoWidth * (9 / 16))
      if (captureHeight > video.videoHeight) {
        captureHeight = video.videoHeight
        captureWidth = Math.round(video.videoHeight * (16 / 9))
      }
    }

    canvas.width = captureWidth
    canvas.height = captureHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const offsetX = (video.videoWidth - captureWidth) / 2
    const offsetY = (video.videoHeight - captureHeight) / 2
    ctx.drawImage(video, offsetX, offsetY, captureWidth, captureHeight, 0, 0, captureWidth, captureHeight)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    setCapturedPhotoDataUrl(dataUrl)
    setPhase('editor')
    setIsReportPhoto(false)

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    video.srcObject = null
  }, [user, videoRef, streamRef])

  const handleRetake = useCallback(() => {
    setCapturedPhotoDataUrl(null)
    setSelectedFrameId(null)
    setIsReportPhoto(false)
    restartCamera()
    setPhase('camera')
  }, [restartCamera])

  const handleDiscard = useCallback(() => {
    setCapturedPhotoDataUrl(null)
    setSelectedFrameId(null)
    setIsReportPhoto(false)
    navigate(-1)
  }, [navigate])

  const handleSave = useCallback(async () => {
    if (!editorCanvasRef.current || !childId || !participant || !user || !isMine) return
    if (!participant.session_id) {
      addToast({ type: 'error', message: 'Peserta belum masuk sesi' })
      return
    }
    setIsSaving(true)
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        editorCanvasRef.current!.toBlob(resolve, 'image/jpeg', 0.9),
      )
      if (!blob) throw new Error('Gagal mengkonversi gambar')

      await uploadPhoto({
        childId,
        participant,
        takenBy: user.id,
        blob,
        frameId: selectedFrameId,
        isReportPhoto,
      })

      setCapturedPhotoDataUrl(null)
      setSelectedFrameId(null)
      setIsReportPhoto(false)
      setPhase('gallery')
      await loadPhotos()
    } catch (err: unknown) {
      const e = err as Error & { code?: string }
      if (e.message === 'MAX_PHOTOS_REACHED') {
        addToast({ type: 'error', message: 'Maksimal 10 foto per anak' })
      } else if (e.code === 'consent_required') {
        addToast({ type: 'error', message: 'Izin foto belum diberikan' })
        navigate(-1)
      } else {
        addToast({ type: 'error', message: 'Gagal menyimpan foto' })
      }
    } finally {
      setIsSaving(false)
    }
  }, [childId, participant, user, selectedFrameId, isReportPhoto, uploadPhoto, loadPhotos, addToast])

  const handleBack = useCallback(() => {
    if (phase === 'editor') {
      handleRetake()
    } else {
      navigate(-1)
    }
  }, [phase, navigate, handleRetake])

  const handleBackToCamera = useCallback(() => {
    restartCamera()
    setPhase('camera')
  }, [restartCamera])

  const currentCameraLabel = (() => {
    if (window.innerWidth <= 1024) {
      return facingMode === 'environment' ? 'Kamera Belakang' : 'Kamera Depan'
    }
    if (!selectedDeviceId) return 'Otomatis'
    const device = devices.find((d) => d.deviceId === selectedDeviceId)
    return device?.label || 'Kamera'
  })()

  const photoCount = photos.length
  const isMaxPhotos = photoCount >= MAX_PHOTOS

  if (dataLoading) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 p-8 text-center bg-surface-container-low text-on-surface">
        <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
        <p className="text-sm text-on-surface-variant">Memuat data peserta...</p>
      </div>
    )
  }

  if (!participant) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 p-8 text-center bg-surface-container-low text-on-surface">
        <AlertTriangle className="w-16 h-16 text-error" />
        <h2 className="text-xl font-bold">Anak Tidak Ditemukan</h2>
        <p className="text-on-surface-variant">Data anak tidak tersedia atau telah dihapus.</p>
        <Button onClick={() => navigate(-1)}>Kembali</Button>
      </div>
    )
  }

  if (!participant.consent_photo) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 p-8 text-center bg-surface-container-low text-on-surface">
        <Lock className="w-16 h-16 text-error" />
        <h2 className="text-xl font-bold">Akses Foto Diblokir</h2>
        <p className="text-on-surface-variant">Izin foto untuk anak ini belum diberikan oleh orang tua.</p>
        <div className="flex gap-3">
          <Button onClick={() => navigate(-1)}>Kembali</Button>
          <Button variant="secondary" onClick={loadParticipant}>Coba lagi</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-surface-container-low -mx-4 -my-5 lg:-mx-6 lg:-my-6 pb-24">
      <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-5xl mx-auto">
        {!isMine && (
          <div className="flex items-center gap-2 rounded-xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            <Lock className="w-4 h-4 shrink-0" />
            Bukan kelompok Anda — foto hanya dapat dilihat (mode baca saja).
          </div>
        )}
        <div className="flex items-center gap-4 md:gap-6">
          <button
            onClick={handleBack}
            className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center text-primary hover:scale-105 active:scale-95 transition-all flex-shrink-0"
          >
            <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 stroke-[2.5]" />
          </button>
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-on-surface leading-tight">
              Ambil Foto
            </h2>
            <p className="text-xs md:text-sm text-on-surface-variant font-medium">
              Pastikan objek terlihat jelas dalam frame
            </p>
          </div>
        </div>

        <div className="relative aspect-[9/16] md:h-[504px] md:aspect-auto w-full md:max-w-4xl md:mx-auto rounded-3xl overflow-hidden bg-black shadow-md border border-slate-200">
          {phase === 'camera' && (
            <CameraViewport
              videoRef={videoRef}
              cameraState={cameraState}
              showGrid={showGrid}
              pageError={pageError}
              onRetryLoad={() => {
                setPageError(null)
                loadInitialData()
              }}
              participant={participant}
              isMobile={isMobile}
              isDesktop={isDesktop}
              devices={devices}
              selectedDeviceId={selectedDeviceId}
              currentCameraLabel={currentCameraLabel}
              cameraPickerOpen={cameraPickerOpen}
              onToggleCameraPicker={() => setCameraPickerOpen((v) => !v)}
              onCloseCameraPicker={() => setCameraPickerOpen(false)}
              onDeviceChange={selectDevice}
              onSwitchCamera={switchCamera}
              onToggleGrid={() => setShowGrid((v) => !v)}
              photoCount={photoCount}
              maxPhotos={MAX_PHOTOS}
              isMaxPhotos={isMaxPhotos}
              onTakePhoto={takePhoto}
              onOpenGallery={() => setPhase('gallery')}
              onOpenFramePicker={() => setFramePickerOpen(true)}
            />
          )}

          {phase === 'editor' && (
            <div className="w-full h-full flex items-center justify-center bg-black">
              {capturedPhotoDataUrl ? (
                <canvas ref={editorCanvasRef} className="max-w-full max-h-full object-contain rounded-3xl" />
              ) : (
                <div className="flex items-center justify-center text-white/50 text-sm">
                  Memproses gambar...
                </div>
              )}
            </div>
          )}

          {phase === 'gallery' && (
            <PhotoGallery photos={photos} participant={participant} onPhotoClick={setFullscreenPhoto} />
          )}

          <canvas ref={captureCanvasRef} className="hidden" />
        </div>

        {phase === 'editor' && (
          <PhotoEditor
            participant={participant}
            selectedFrameId={selectedFrameId}
            isReportPhoto={isReportPhoto}
            isSaving={isSaving}
            onOpenFramePicker={() => setFramePickerOpen(true)}
            onClearFrame={() => setSelectedFrameId(null)}
            onToggleReportPhoto={setIsReportPhoto}
            onRetake={handleRetake}
            onSave={handleSave}
            onDiscard={handleDiscard}
          />
        )}

        {phase === 'gallery' && (
          <div className="flex justify-center md:justify-start">
            <Button
              icon={<Camera className="w-4 h-4" />}
              onClick={handleBackToCamera}
              className="w-full max-w-xs md:w-auto"
            >
              Ambil Baru
            </Button>
          </div>
        )}

        <Modal
          open={framePickerOpen}
          onClose={() => setFramePickerOpen(false)}
          title="Pilih Frame"
          size="md"
        >
          <FramePicker
            frames={activeFrames}
            selectedFrameId={selectedFrameId}
            onSelect={(id) => {
              setSelectedFrameId(id)
              setFramePickerOpen(false)
            }}
          />
        </Modal>

        {fullscreenPhoto && (
          <FullscreenPhoto
            photo={fullscreenPhoto}
            onClose={() => setFullscreenPhoto(null)}
            onDelete={() => setConfirmDeletePhoto(true)}
          />
        )}

        <ConfirmDialog
          open={confirmDeletePhoto}
          title="Hapus Foto"
          message="Yakin ingin menghapus foto ini? Tindakan ini tidak dapat dibatalkan."
          onConfirm={async () => {
            if (!fullscreenPhoto) return
            try {
              await deletePhoto(fullscreenPhoto.id)
              setFullscreenPhoto(null)
            } catch {
              addToast({ type: 'error', message: 'Gagal menghapus foto' })
            } finally {
              setConfirmDeletePhoto(false)
            }
          }}
          onClose={() => setConfirmDeletePhoto(false)}
        />
      </div>
    </div>
  )
}

export default SmartPhotoPage
