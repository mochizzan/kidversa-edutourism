import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Camera,
  X,
  Check,
  RotateCcw,
  Trash2,
  AlertTriangle,
  ChevronLeft,
  Award,
  LayoutGrid,
  RefreshCw,
  ChevronDown,
  Monitor,
  Zap,
  Image,
} from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Modal } from '../../../shared/components/ui/Modal'
import { cn } from '../../../core/utils'
import { resolveStoredUpload } from '../../../core/utils/media'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { ConfirmDialog } from '../../../shared/components/feedback/ConfirmDialog'
import { photoService } from '../../../core/services/photos'
import { frameService } from '../../../core/services/frames'
import { sessionService } from '../../../core/services/sessions'
import { useAuthStore } from '../../../core/stores/authStore'
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

  /* ── Refs ── */
  const videoRef = useRef<HTMLVideoElement>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement>(null)
  const editorCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mountedRef = useRef(true)
  const cancelledRef = useRef(false)

  /* ── Phase & Camera States ── */
  const [phase, setPhase] = useState<'camera' | 'editor' | 'gallery'>('camera')
  const [cameraState, setCameraState] = useState<'loading' | 'active' | 'denied' | 'error'>('loading')
  const [pageError, setPageError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [needsCameraRestart, setNeedsCameraRestart] = useState(false)
  const [cameraPickerOpen, setCameraPickerOpen] = useState(false)
  const [showGrid, setShowGrid] = useState(false)

  /* ── Mobile Detection ── */
  const [isMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 1024)
  const [isDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth > 1024)

  /* ── Data ── */
  const [frames, setFrames] = useState<PhotoFrame[]>([])
  const [activeFrames, setActiveFrames] = useState<PhotoFrame[]>([])
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null)
  const [photos, setPhotos] = useState<SmartPhoto[]>([])
  const [capturedPhotoDataUrl, setCapturedPhotoDataUrl] = useState<string | null>(null)

  /* ── Editor ── */
  const [isReportPhoto, setIsReportPhoto] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  /* ── Fullscreen ── */
  const [fullscreenPhoto, setFullscreenPhoto] = useState<SmartPhoto | null>(null)
  const [confirmDeletePhoto, setConfirmDeletePhoto] = useState(false)

  /* ── Frame Picker Modal ── */
  const [framePickerOpen, setFramePickerOpen] = useState(false)

  /* ── Participant Lookup ── */
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (!childId) {
      setDataLoading(false)
      return
    }

    let cancelled = false

    const loadParticipant = async () => {
      try {
        const part = await sessionService.getParticipantById(childId)
        if (!cancelled) setParticipant(part)
      } catch {
        if (!cancelled) setParticipant(null)
      } finally {
        if (!cancelled) setDataLoading(false)
      }
    }

    loadParticipant()
    return () => { cancelled = true }
  }, [childId])

  /* ── Camera Setup ── */
  useEffect(() => {
    mountedRef.current = true
    cancelledRef.current = false

    if (phase !== 'camera') return

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    const start = async () => {
      setCameraState('loading')

      try {
        let videoInputs: MediaDeviceInfo[] = []
        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices()
          if (!mountedRef.current) return
          videoInputs = allDevices.filter(d => d.kind === 'videoinput')
          setDevices(videoInputs)
        } catch {
          // fallback
        }

        const idealRes = { width: { ideal: 1280 }, height: { ideal: 720 } }
        const constraintsToTry: MediaTrackConstraints[] = []

        if (selectedDeviceId) {
          // User explicitly picked a device — only try exact match, no generic fallback
          constraintsToTry.push({ deviceId: { exact: selectedDeviceId }, ...idealRes })
        } else {
          // Auto mode — try facingMode variants then generic fallback
          constraintsToTry.push({ facingMode, ...idealRes })
          const oppositeMode = facingMode === 'environment' ? 'user' : 'environment'
          constraintsToTry.push({ facingMode: oppositeMode, ...idealRes })
          constraintsToTry.push({ ...idealRes })
        }

        let lastError: DOMException | null = null
        let gotStream = false
        for (const videoConstraints of constraintsToTry) {
          if (cancelledRef.current) return
          try {
            const s = await navigator.mediaDevices.getUserMedia({
              video: videoConstraints,
              audio: false,
            })
            streamRef.current = s
            lastError = null
            gotStream = true
            break
          } catch (err) {
            lastError = err as DOMException
          }
        }

        if (!mountedRef.current) {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop())
            streamRef.current = null
          }
          return
        }

        if (gotStream) {
          setCameraState('active')

          try {
            const allDevices = await navigator.mediaDevices.enumerateDevices()
            if (!mountedRef.current) return
            const updatedInputs = allDevices.filter(d => d.kind === 'videoinput')
            if (updatedInputs.length > 0) setDevices(updatedInputs)
          } catch {
            // ignore
          }
        } else if (lastError) {
          await handleCameraError(lastError)
        }
      } catch (err: unknown) {
        if (!mountedRef.current) return
        await handleCameraError(err as DOMException)
      }
    }

    const handleCameraError = async (e: DOMException) => {
      let availableDevices: MediaDeviceInfo[] = []
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices()
        availableDevices = allDevices.filter(d => d.kind === 'videoinput')
        if (!mountedRef.current) return
        setDevices(availableDevices)
      } catch {
        // ignore
      }

      let toastMessage = ''

      switch (e.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          setCameraState('denied')
          toastMessage = 'Izin kamera ditolak. Izinkan akses kamera di pengaturan browser.'
          break

        case 'NotReadableError':
          setCameraState('error')
          toastMessage = 'Kamera sedang digunakan oleh aplikasi lain. Tutup aplikasi lain lalu coba lagi.'
          break

        case 'NotFoundError':
          setCameraState('error')
          toastMessage = 'Tidak ada kamera yang terdeteksi. Pasang webcam lalu coba lagi.'
          break

        case 'OverconstrainedError':
          setCameraState('error')
          toastMessage = 'Kamera tidak mendukung resolusi yang diminta. Coba pilih kamera lain.'
          break

        case 'AbortError':
          setCameraState('error')
          toastMessage = 'Akses kamera dibatalkan. Coba lagi.'
          break

        default:
          setCameraState('error')
          toastMessage = 'Gagal mengakses kamera. Periksa koneksi webcam atau berikan izin.'
          break
      }

      if (toastMessage) {
        addToast({
          type: e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError'
            ? 'error'
            : 'warning',
          message: toastMessage,
          duration: 6000,
        })
      }
    }

    start()

    return () => {
      mountedRef.current = false
      cancelledRef.current = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }
  }, [facingMode, selectedDeviceId, phase, needsCameraRestart])

  useEffect(() => {
    if (cameraState !== 'active' || phase !== 'camera') return
    if (streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [cameraState, phase])

  useEffect(() => {
    if (needsCameraRestart && cameraState === 'active') {
      setNeedsCameraRestart(false)
    }
  }, [needsCameraRestart, cameraState])

  useEffect(() => {
    frameService.getAll({ page: 1, limit: 100 }).then((res) => {
      setFrames(res.data)
      setActiveFrames(res.data.filter((f) => f.is_active))
    }).catch(() => {
      setPageError('Gagal memuat data frame. Periksa koneksi lalu coba lagi.')
    })
    if (childId) {
      photoService.getByParticipant(childId).then(setPhotos).catch(() => {
        setPageError('Gagal memuat data foto. Periksa koneksi lalu coba lagi.')
      })
    }
  }, [childId])

  const loadPhotos = useCallback(async () => {
    if (!childId) return
    try {
      const updated = await photoService.getByParticipant(childId)
      setPhotos(updated)
    } catch {
      addToast({ type: 'error', message: 'Gagal memuat ulang foto.' })
    }
  }, [childId, addToast])

  /* ── Canvas Redraw (Editor) ── */
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
            const frameImg = await loadImage(resolveStoredUpload(frame.file_url, 'frame') ?? frame.file_url)
            if (!cancelled) {
              ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height)
            }
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
    if (!videoRef.current || !captureCanvasRef.current || !user) return
    const video = videoRef.current
    const canvas = captureCanvasRef.current
    const isPortrait = window.innerWidth <= 1024

    let captureWidth: number
    let captureHeight: number

    if (isPortrait) {
      // Mobile: 9:16 portrait capture
      captureHeight = video.videoHeight
      captureWidth = Math.round(video.videoHeight * (9 / 16))
      if (captureWidth > video.videoWidth) {
        captureWidth = video.videoWidth
        captureHeight = Math.round(video.videoWidth * (16 / 9))
      }
    } else {
      // Desktop: 16:9 landscape capture
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
  }, [user])

  const handleRetake = useCallback(async () => {
    setCapturedPhotoDataUrl(null)
    setSelectedFrameId(null)
    setIsReportPhoto(false)
    setNeedsCameraRestart(true)
    setPhase('camera')
  }, [])

  const handleDiscard = useCallback(() => {
    setCapturedPhotoDataUrl(null)
    setSelectedFrameId(null)
    setIsReportPhoto(false)
    navigate(-1)
  }, [navigate])

  const handleSave = useCallback(async () => {
    if (!editorCanvasRef.current || !childId || !participant || !user) return
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

      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const photo = await photoService.upload(childId, participant.session_id, file)

      if (selectedFrameId || isReportPhoto) {
        const updateData: Partial<SmartPhoto> = {}
        if (selectedFrameId) {
          updateData.frame_id = selectedFrameId
        }
        if (isReportPhoto && participant.consent_photo) {
          updateData.is_report_photo = true
        }
        updateData.taken_by = user.id
        
        await photoService.update(photo.id, updateData)
        
        if (isReportPhoto && participant.consent_photo) {
          const allPhotos = await photoService.getByParticipant(childId)
          for (const p of allPhotos) {
            if (p.id !== photo.id && p.is_report_photo) {
              await photoService.update(p.id, { is_report_photo: false })
            }
          }
        }
      }

      setCapturedPhotoDataUrl(null)
      setSelectedFrameId(null)
      setIsReportPhoto(false)
      setPhase('gallery')
      await loadPhotos()
    } catch (err: unknown) {
      const e = err as Error
      if (e.message === 'MAX_PHOTOS_REACHED') {
        addToast({ type: 'error', message: 'Maksimal 10 foto per anak' })
      } else {
        addToast({ type: 'error', message: 'Gagal menyimpan foto' })
      }
    } finally {
      setIsSaving(false)
    }
  }, [childId, participant, user, selectedFrameId, isReportPhoto, loadPhotos, addToast])

  const handleBack = useCallback(() => {
    if (phase === 'gallery') {
      navigate(-1)
    } else if (phase === 'editor') {
      handleRetake()
    } else {
      navigate(-1)
    }
  }, [phase, navigate, handleRetake])

  const photoCount = photos.length
  const isMaxPhotos = photoCount >= MAX_PHOTOS

  const handleBackToCamera = useCallback(async () => {
    setNeedsCameraRestart(true)
    setPhase('camera')
  }, [])

  const handleSwitchCamera = useCallback(() => {
    setSelectedDeviceId('')
    setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))
  }, [])

  const handleDeviceChange = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId)
  }, [])

  const toggleGrid = useCallback(() => {
    setShowGrid((prev) => !prev)
  }, [])

  const currentCameraLabel = (() => {
    if (window.innerWidth <= 1024) {
      return facingMode === 'environment' ? 'Kamera Belakang' : 'Kamera Depan'
    }
    if (!selectedDeviceId) return 'Otomatis'
    const device = devices.find((d) => d.deviceId === selectedDeviceId)
    return device?.label || 'Kamera'
  })()

  const renderFramePickerContent = () => (
    <div className="grid grid-cols-3 gap-3">
      <button
        onClick={() => { setSelectedFrameId(null); setFramePickerOpen(false) }}
        className={cn(
          'aspect-square rounded-xl border-2 flex items-center justify-center text-xs font-semibold relative transition-all',
          selectedFrameId === null
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-outline-variant text-on-surface-variant hover:border-on-surface',
        )}
      >
        Tanpa Frame
        {selectedFrameId === null && (
          <div className="absolute -top-1.5 -right-1.5 bg-primary text-white rounded-full p-0.5 shadow-sm">
            <Check className="w-3.5 h-3.5" />
          </div>
        )}
      </button>
      {activeFrames.map((frame) => (
        <button
          key={frame.id}
          onClick={() => { setSelectedFrameId(frame.id); setFramePickerOpen(false) }}
          className={cn(
            'aspect-square rounded-xl overflow-hidden border-2 relative transition-all',
            selectedFrameId === frame.id
              ? 'border-primary scale-105 shadow-md'
              : 'border-transparent hover:border-white/30',
          )}
        >
          {(frame.thumbnail_url || frame.file_url) ? (
            <img
              src={resolveStoredUpload(frame.thumbnail_url || frame.file_url, 'frame') ?? frame.file_url}
              alt={frame.name}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="%23e0e0e0" width="200" height="200"/><text x="50%" y="50%" fill="%23999" text-anchor="middle" dy=".3em" font-size="14" font-family="sans-serif">Gagal Muat</text></svg>' }}
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

  return (
    <div className="min-h-dvh bg-surface-container-low -mx-4 -my-5 lg:-mx-6 lg:-my-6 pb-24">
    <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-5xl mx-auto">
      {/* ── Sub-Header & Page Title ── */}
      <div className="flex items-center gap-4 md:gap-6">
        <button
          onClick={handleBack}
          className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center text-primary hover:scale-105 active:scale-95 transition-all flex-shrink-0"
        >
          <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 stroke-[2.5]" />
        </button>
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-on-surface leading-tight">Ambil Foto</h2>
          <p className="text-xs md:text-sm text-on-surface-variant font-medium">Pastikan objek terlihat jelas dalam frame</p>
        </div>
      </div>

      {/* ── Viewport Kamera (Area Feed Video) ── */}
      <div className="relative aspect-[9/16] md:h-[504px] md:aspect-auto w-full md:max-w-4xl md:mx-auto rounded-3xl overflow-hidden bg-black shadow-md border border-slate-200">
        {/* Grid overlay */}
        {cameraState === 'active' && showGrid && (
          <div className="absolute inset-0 z-[5] pointer-events-none">
            {/* Rule of thirds grid */}
            <div className="absolute top-0 left-1/3 w-px h-full bg-white/30" />
            <div className="absolute top-0 left-2/3 w-px h-full bg-white/30" />
            <div className="absolute top-1/3 left-0 h-px w-full bg-white/30" />
            <div className="absolute top-2/3 left-0 h-px w-full bg-white/30" />
          </div>
        )}

        {/* Feed Video */}
        {phase === 'camera' && (
          <>
            {pageError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 bg-on-surface text-white z-10">
                <AlertTriangle className="w-16 h-16 text-accent" />
                <p className="text-sm text-white/70 text-center max-w-[280px]">{pageError}</p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPageError(null)
                    frameService.getAll({ page: 1, limit: 100 }).then((res) => {
                      setFrames(res.data)
                      setActiveFrames(res.data.filter((f) => f.is_active))
                    }).catch(() => {
                      setPageError('Gagal memuat data frame. Periksa koneksi lalu coba lagi.')
                    })
                    if (childId) {
                      photoService.getByParticipant(childId).then(setPhotos).catch(() => {
                        setPageError('Gagal memuat data foto. Periksa koneksi lalu coba lagi.')
                      })
                    }
                  }}
                >
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

            {/* Overlay: Nama Anak (Kiri Atas Viewport) — glassmorphism badge */}
            {cameraState !== 'loading' && (
              <div className="absolute top-4 left-4 z-10 backdrop-blur-md bg-white/15 border border-white/20 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg">
                {participant.child_name || 'Siti Aminah'} ({participant.child_age || '5'} thn)
              </div>
            )}

            {/* Overlay: Camera error badge */}
            {(cameraState === 'denied' || cameraState === 'error') && (
              <div className="absolute top-14 left-4 z-10 flex items-center gap-1.5 backdrop-blur-md bg-error/20 border border-error/30 text-white/90 px-3 py-1 rounded-full text-[10px] font-bold shadow-lg">
                <AlertTriangle className="w-3 h-3" />
                Kamera Error
              </div>
            )}

            {/* Overlay: Dropdown Kamera (Kanan Atas Viewport) — glassmorphism, desktop only */}
            {cameraState !== 'loading' && isDesktop && devices.length > 0 && (
              <div className="absolute top-4 right-4 z-10">
                <button
                  onClick={() => setCameraPickerOpen(!cameraPickerOpen)}
                  className="flex items-center gap-2 backdrop-blur-md bg-white/15 border border-white/20 text-white text-xs font-bold px-3.5 py-1.5 rounded-full shadow-lg hover:bg-white/25 transition-all"
                >
                  <Camera className="w-3.5 h-3.5 text-white/90" />
                  <span className="max-w-[120px] truncate">{currentCameraLabel}</span>
                  <ChevronDown className="w-3 h-3 text-white/70" />
                </button>

                {cameraPickerOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setCameraPickerOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-64 bg-white text-slate-800 rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50">
                      <div className="p-1.5 space-y-1">
                        <button
                          onClick={() => { handleDeviceChange(''); setCameraPickerOpen(false) }}
                          className={cn(
                            'w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all text-xs font-bold',
                            !selectedDeviceId ? 'bg-primary-container text-primary' : 'hover:bg-surface-container-low text-on-surface',
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
                              onClick={() => { handleDeviceChange(device.deviceId); setCameraPickerOpen(false) }}
                              className={cn(
                                'w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all text-xs font-bold truncate',
                                isSelected ? 'bg-primary-container text-primary' : 'hover:bg-surface-container-low text-on-surface',
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

            {/* Overlay: Kontrol Vertikal (Kanan Tengah Viewport) — glassmorphism, mobile only */}
            {cameraState !== 'loading' && isMobile && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-4">
                <CircleControlBtn icon={Zap} label="Flash" onClick={() => {}} />
                <CircleControlBtn icon={RefreshCw} label="Balik" onClick={handleSwitchCamera} />
                <CircleControlBtn
                  icon={LayoutGrid}
                  label="Grid"
                  onClick={toggleGrid}
                  active={showGrid}
                />
              </div>
            )}

            {/* Overlay: Floating Control Bar (Bawah Tengah Viewport) — glassmorphism */}
            {cameraState !== 'loading' && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[90%] md:w-[70%] max-w-md backdrop-blur-md bg-black/50 border border-white/15 rounded-full px-5 py-3 flex items-center justify-between gap-4 shadow-lg">
                {/* Kiri: Counter — clickable, with icon */}
                <button
                  onClick={() => setPhase('gallery')}
                  className="flex items-center gap-1.5 text-xs font-extrabold text-white/80 hover:text-white transition-colors"
                >
                  <Image className="w-3.5 h-3.5" />
                  <span>{photoCount}/{MAX_PHOTOS}</span>
                </button>

                {/* Tengah: Shutter Button */}
                <button
                  onClick={takePhoto}
                  disabled={isMaxPhotos || cameraState !== 'active'}
                  className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-90 transition-all flex-shrink-0 relative group"
                >
                  <div className="absolute inset-[3px] rounded-full border-2 border-primary/30 group-hover:border-primary/50 transition-all" />
                  <Camera className="w-6 h-6 text-primary" />
                </button>

                {/* Kanan: Frame Label — with icon */}
                <button
                  onClick={() => setFramePickerOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-extrabold text-white/80 hover:text-white transition-colors"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Frame
                </button>
              </div>
            )}
          </>
        )}

        {/* Editor Phase */}
        {phase === 'editor' && (
          <div className="w-full h-full flex items-center justify-center bg-black">
            {capturedPhotoDataUrl ? (
              <canvas ref={editorCanvasRef} className="max-w-full max-h-full object-contain rounded-3xl" />
            ) : (
              <div className="flex items-center justify-center text-white/50 text-sm">Memproses gambar...</div>
            )}
          </div>
        )}

        {/* Gallery Phase */}
        {phase === 'gallery' && (
          <div className="w-full h-full overflow-y-auto bg-white rounded-3xl p-4 md:p-6">
            {photos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-on-surface-variant">
                <Camera className="w-16 h-16 opacity-30" />
                <p className="text-sm">Belum ada foto untuk {participant.child_name}</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {photos.map((photo) => (
                  <button
                    key={photo.id}
                    onClick={() => setFullscreenPhoto(photo)}
                    className="aspect-[3/4] overflow-hidden rounded-2xl bg-surface-container-low relative group border border-surface-container-highest shadow-sm"
                  >
                    <img
                      src={(resolveStoredUpload(photo.framed_file_url || photo.original_file_url, 'photo')) ?? (photo.framed_file_url || photo.original_file_url)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    {photo.is_report_photo && (
                      <div className="absolute top-2 right-2 bg-accent text-white rounded-full p-1 shadow">
                        <Award className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all rounded-2xl" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Hidden Canvas */}
        <canvas ref={captureCanvasRef} className="hidden" />
      </div>

      {/* ── Editor Controls ── */}
      {phase === 'editor' && (
        <div className="bg-white border border-surface-container-highest rounded-3xl p-5 shadow-sm space-y-4 max-w-lg md:mx-auto">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setFramePickerOpen(true)}
              className="flex items-center gap-2 text-sm font-extrabold text-on-surface bg-surface-container-low hover:bg-surface-container-high px-4 py-2 rounded-xl transition-all"
            >
              <LayoutGrid className="w-4 h-4 text-primary" />
              {selectedFrameId ? 'Ganti Frame' : 'Pilih Frame'}
            </button>
            {selectedFrameId && (
              <button onClick={() => setSelectedFrameId(null)} className="text-xs font-bold text-error hover:underline">
                Hapus Frame
              </button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-bold text-on-surface cursor-pointer">
              <input
                type="checkbox"
                checked={isReportPhoto}
                onChange={(e) => setIsReportPhoto(e.target.checked)}
                disabled={!participant.consent_photo}
                className="w-4 h-4 rounded accent-primary"
              />
              Jadikan Foto Raport
            </label>
            {!participant.consent_photo && (
              <span className="text-[10px] text-warning-text bg-warning-surface px-2 py-0.5 rounded-full font-bold">
                Izin foto belum diberikan
              </span>
            )}
          </div>

          <div className="flex items-center justify-center gap-4 pt-2">
            <Button
              variant="secondary"
              icon={<RotateCcw className="w-4 h-4" />}
              onClick={handleRetake}
              className="w-full justify-center"
            >
              Ulang
            </Button>
            <Button
              loading={isSaving}
              icon={<Check className="w-4 h-4" />}
              onClick={handleSave}
              className="w-full justify-center"
            >
              Simpan
            </Button>
            <Button
              variant="ghost"
              onClick={handleDiscard}
              className="text-on-surface-variant"
            >
              Batal
            </Button>
          </div>
        </div>
      )}

      {/* ── Gallery Phase Action Button ── */}
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

      {/* ── Modals ── */}
      <Modal open={framePickerOpen} onClose={() => setFramePickerOpen(false)} title="Pilih Frame" size="md">
        {renderFramePickerContent()}
      </Modal>

      {fullscreenPhoto && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setFullscreenPhoto(null)}>
          <img src={(resolveStoredUpload(fullscreenPhoto.framed_file_url || fullscreenPhoto.original_file_url, 'photo')) ?? (fullscreenPhoto.framed_file_url || fullscreenPhoto.original_file_url)} alt="" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
          <button onClick={() => setFullscreenPhoto(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-all">
            <X className="w-6 h-6" />
          </button>
          <button
            onClick={() => setConfirmDeletePhoto(true)}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-error text-white px-5 py-2.5 rounded-full text-sm font-bold shadow-md hover:bg-error-dark transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Hapus Foto
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeletePhoto}
        title="Hapus Foto"
        message="Yakin ingin menghapus foto ini? Tindakan ini tidak dapat dibatalkan."
        onConfirm={async () => {
          if (!fullscreenPhoto) return
          try {
            await photoService.delete(fullscreenPhoto.id)
            setFullscreenPhoto(null)
            await loadPhotos()
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

const CircleControlBtn = ({ icon: Icon, label, onClick, active }: { icon: any, label: string, onClick: () => void, active?: boolean }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center gap-0.5 group"
  >
    <div className={cn(
      'w-12 h-12 rounded-full backdrop-blur-md border flex items-center justify-center group-active:scale-95 transition-all shadow-lg',
      active
        ? 'bg-white/90 border-primary/40 text-primary'
        : 'bg-camera-overlay border-outline-camera text-white group-hover:bg-black/60',
    )}>
      <Icon className="w-5 h-5" />
    </div>
    <span className={cn(
      'text-[10px] font-extrabold tracking-wider uppercase leading-none drop-shadow-sm',
      active ? 'text-white' : 'text-white/80',
    )}>{label}</span>
  </button>
)

export default SmartPhotoPage
