import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronLeft, Lock } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Modal } from '../../../shared/components/ui/Modal'
import { getMediaUrl } from '../../../core/utils/media'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { ConfirmDialog } from '../../../shared/components/feedback/ConfirmDialog'
import { frameService } from '../../../core/services/frames'
import { sessionService } from '../../../core/services/sessions'
import { programService } from '../../../core/services/programs'
import { useAuthStore } from '../../../core/stores/authStore'
import { useCamera } from '../hooks/useCamera'
import { useSmartPhotos } from '../hooks/useSmartPhotos'
import { useGroupOwnership } from '../hooks/useGroupOwnership'
import { CameraViewport } from '../components/CameraViewport'
import { PhotoEditor } from '../components/PhotoEditor'
import { PhotoGallery, FullscreenPhoto } from '../components/PhotoGallery'
import { FramePicker } from '../components/FramePicker'
import type { SmartPhoto, PhotoFrame, Participant, SessionStage } from '../../../core/types'

/**
 * Ref-stable snapshots of values that `handleSave` needs but that arrive
 * asynchronously (participant, isMine). Avoids stale-closure bugs caused by
 * `useCallback([], [])` capturing the initial `null`/`true` values.
 */
function useStableRef<T>(value: T): React.RefObject<T> {
 const ref = useRef(value)
 ref.current = value
 return ref
}

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
 const { t } = useTranslation()
 const { childId } = useParams<{ groupId: string; childId: string }>()
 const navigate = useNavigate()
 const user = useAuthStore((s) => s.user)
 const { addToast } = useGlobalToast()
 const { isMine, group } = useGroupOwnership(childId)

 const captureCanvasRef = useRef<HTMLCanvasElement>(null)
 const editorCanvasRef = useRef<HTMLCanvasElement>(null)

 const [phase, setPhase] = useState<'camera' | 'editor'>('camera')
 const [galleryOpen, setGalleryOpen] = useState(false)
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
 const [confirmDeletePhoto, setConfirmDeletePhoto] = useState<SmartPhoto | null>(null)
 const [framePickerOpen, setFramePickerOpen] = useState(false)

 const [participant, setParticipant] = useState<Participant | null>(null)
 const [dataLoading, setDataLoading] = useState(true)
 const loadCancelledRef = useRef(false)

 const [topics, setTopics] = useState<{ programStageId: string; name: string }[]>([])
 const [sessStages, setSessStages] = useState<SessionStage[]>([])
 const [activeStageId, setActiveStageId] = useState<string | null>(null)

 // Ref-stable snapshots for handleSave to avoid stale closure.
 const participantRef = useStableRef(participant)
 const isMineRef = useStableRef(isMine)

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

 const { photos, loadPhotos, deletePhoto, uploadPhoto, picks, loadPicks, setPick, clearPick } =
  useSmartPhotos(childId, participant)

 const loadParticipant = useCallback(async () => {
  if (!childId) return
  loadCancelledRef.current = false
  try {
   const part = await sessionService.getParticipantById(childId)
   if (loadCancelledRef.current) return
   setParticipant(part)
   if (!part?.session_id) return
   try {
    const [detail, stages] = await Promise.all([
     sessionService.getById(part.session_id),
     sessionService.getStages(part.session_id),
    ])
    if (loadCancelledRef.current) return
    const programStages = detail ? await programService.getStages(detail.program_id) : []
    if (loadCancelledRef.current) return
    const progById = new Map(programStages.map((s) => [s.id, s]))
    setSessStages(stages)
    setTopics(
     stages.map((s) => ({
      programStageId: s.program_stage_id,
      name: progById.get(s.program_stage_id)?.name ?? t('fasilitator.topicFallback'),
     })),
    )
   } catch {
    // Topik gagal dimuat — galeri tetap jalan dengan nama fallback.
    if (!loadCancelledRef.current) {
     setSessStages([])
     setTopics([])
    }
   }
  } catch {
   if (!loadCancelledRef.current) setParticipant(null)
  } finally {
   if (!loadCancelledRef.current) setDataLoading(false)
  }
 }, [childId, t])

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
    setPageError(t('fasilitator.photos.frameLoadError'))
   })
  if (childId) {
   Promise.all([loadPhotos(), loadPicks()]).catch(() => {
    setPageError(t('fasilitator.photos.photoLoadError'))
   })
  }
 }, [childId, loadPhotos, loadPicks])

 useEffect(() => {
  loadInitialData()
 }, [childId, loadInitialData])

 // Muat picks begitu participant siap (loadInitialData berjalan saat participant
 // masih null — guard di hook menahannya).
 useEffect(() => {
  if (participant) loadPicks()
 }, [participant, loadPicks])

 // Default topik = current_session_stage_id grup, fallback stage pertama;
 // pilihan user (activeStageId) menang — pola useChildAssessment.
 useEffect(() => {
  if (!sessStages.length) return
  const fallbackStage =
   sessStages.find((s) => s.id === group?.current_session_stage_id) ?? sessStages[0]
  setActiveStageId((prev) => prev ?? fallbackStage?.program_stage_id ?? null)
 }, [sessStages, group])

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
      if (!cancelled) {
       addToast({ type: 'warning', message: t('fasilitator.photos.frameFallbackToast') })
      }
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
 }, [user, isMine, videoRef, streamRef])

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
  // Read from refs so we always see the LATEST values — avoids the stale
  // closure bug where `participant` was captured as null on first render.
  const currentParticipant = participantRef.current
  const currentIsMine = isMineRef.current
  if (!editorCanvasRef.current || !childId || !currentParticipant || !user || !currentIsMine) return
  if (!currentParticipant.session_id) {
   addToast({ type: 'error', message: t('fasilitator.photos.notInSession') })
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
    participant: currentParticipant,
    takenBy: user.id,
    blob,
    frameId: selectedFrameId,
    isReportPhoto,
   })

   setCapturedPhotoDataUrl(null)
   setSelectedFrameId(null)
   setIsReportPhoto(false)
   setPhase('camera')
   setGalleryOpen(true)
   await loadPhotos()
  } catch (err: unknown) {
   const e = err as Error & { code?: string }
   if (e.message === 'MAX_PHOTOS_REACHED') {
    addToast({ type: 'error', message: t('fasilitator.photos.maxPhotos', { max: MAX_PHOTOS }) })
   } else if (e.code === 'consent_required') {
    addToast({ type: 'error', message: t('fasilitator.photos.consentRequired') })
    navigate(-1)
   } else {
    addToast({ type: 'error', message: t('fasilitator.photos.saveError') })
   }
  } finally {
   setIsSaving(false)
  }
 }, [childId, user, selectedFrameId, isReportPhoto, uploadPhoto, loadPhotos, addToast, navigate])

 const handleBack = useCallback(() => {
  if (galleryOpen) {
   setGalleryOpen(false)
  } else if (phase === 'editor') {
   handleRetake()
  } else {
   navigate(-1)
  }
 }, [phase, galleryOpen, navigate, handleRetake])

 const handleTogglePick = async (photo: SmartPhoto) => {
  if (!activeStageId) return
  if (photo.id === pickPhotoId) {
   if (await clearPick(activeStageId)) return
   addToast({ type: 'error', message: t('fasilitator.photos.clearPickError') })
  } else {
   if (await setPick(activeStageId, photo.id)) return
   addToast({ type: 'error', message: t('fasilitator.photos.pickError') })
  }
 }

 const currentCameraLabel = (() => {
  if (window.innerWidth <= 1024) {
   return facingMode === 'environment' ? t('fasilitator.camera.back') : t('fasilitator.camera.front')
  }
  if (!selectedDeviceId) return t('fasilitator.camera.auto')
  const device = devices.find((d) => d.deviceId === selectedDeviceId)
  return device?.label || t('fasilitator.camera.deviceFallback')
 })()

 const photoCount = photos.length
 const isMaxPhotos = photoCount >= MAX_PHOTOS
 const activeTopicName =
  topics.find((tp) => tp.programStageId === activeStageId)?.name ?? t('fasilitator.topicFallback')
 const pickPhotoId = picks.find((p) => p.program_stage_id === activeStageId)?.photo_id ?? null

 if (dataLoading) {
  return (
   <div className="h-dvh flex flex-col items-center justify-center gap-4 p-8 text-center bg-surface-container-low text-on-surface">
    <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
    <p className="text-sm text-on-surface-variant">{t('fasilitator.photos.loadingParticipant')}</p>
   </div>
  )
 }

 if (!participant) {
  return (
   <div className="h-dvh flex flex-col items-center justify-center gap-4 p-8 text-center bg-surface-container-low text-on-surface">
    <AlertTriangle className="w-16 h-16 text-error" />
    <h2 className="text-xl font-bold">{t('fasilitator.photos.childMissingTitle')}</h2>
    <p className="text-on-surface-variant">{t('fasilitator.photos.childMissingDesc')}</p>
    <Button onClick={() => navigate(-1)}>{t('common.back')}</Button>
   </div>
  )
 }

 if (!participant.consent_photo) {
  return (
   <div className="h-dvh flex flex-col items-center justify-center gap-4 p-8 text-center bg-surface-container-low text-on-surface">
    <Lock className="w-16 h-16 text-error" />
    <h2 className="text-xl font-bold">{t('fasilitator.photos.blockedTitle')}</h2>
    <p className="text-on-surface-variant">{t('fasilitator.photos.blockedDesc')}</p>
    <div className="flex gap-3">
     <Button onClick={() => navigate(-1)}>{t('common.back')}</Button>
     <Button variant="secondary" onClick={loadParticipant}>{t('fasilitator.photos.retry')}</Button>
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
      {t('fasilitator.photos.readOnlyPhoto')}
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
       {t('fasilitator.takePhoto')}
      </h2>
      <p className="text-xs md:text-sm text-on-surface-variant font-medium">
       {t('fasilitator.photos.subtitle')}
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
       onOpenGallery={() => setGalleryOpen(true)}
       onOpenFramePicker={() => setFramePickerOpen(true)}
       disabled={!isMine}
      />
     )}

     {phase === 'editor' && (
      <div className="w-full h-full flex items-center justify-center bg-black">
       {capturedPhotoDataUrl ? (
        <canvas ref={editorCanvasRef} className="max-w-full max-h-full object-contain rounded-3xl" />
       ) : (
        <div className="flex items-center justify-center text-white/50 text-sm">
         {t('fasilitator.photos.processingImage')}
        </div>
       )}
      </div>
     )}

     <canvas ref={captureCanvasRef} className="hidden" />
    </div>

    {/* Gallery Modal */}
    <Modal
     open={galleryOpen}
     onClose={() => setGalleryOpen(false)}
     title={t('fasilitator.photos.galleryTitle', { name: participant.child_name })}
     size="lg"
     footer={
      <div className="flex flex-col gap-0.5">
       <p className="text-sm text-on-surface-variant">
        {t('fasilitator.photos.pickFooter', { topic: activeTopicName })}
       </p>
       <p className="text-xs text-on-surface-variant/70">
        {t('fasilitator.photos.photoCount', { count: photos.length, max: MAX_PHOTOS })}
       </p>
      </div>
     }
    >
     <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
      {topics.map((tp) => (
       <button
        key={tp.programStageId}
        type="button"
        onClick={() => setActiveStageId(tp.programStageId)}
        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${tp.programStageId === activeStageId
         ? 'bg-primary text-white'
         : 'bg-surface-container-highest text-on-surface-variant hover:bg-primary/10'
         }`}
       >
        {tp.name}
       </button>
      ))}
     </div>
     <PhotoGallery
      photos={photos}
      participant={participant}
      onPhotoClick={setFullscreenPhoto}
      activeStageId={activeStageId}
      pickPhotoId={pickPhotoId}
      onTogglePick={handleTogglePick}
      onDelete={(photo) => setConfirmDeletePhoto(photo)}
     />
    </Modal>

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

    <Modal
     open={framePickerOpen}
     onClose={() => setFramePickerOpen(false)}
     title={t('fasilitator.photos.chooseFrame')}
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
      onDelete={() => setConfirmDeletePhoto(fullscreenPhoto)}
     />
    )}

    <ConfirmDialog
     open={confirmDeletePhoto !== null}
     title={t('fasilitator.photos.deletePhoto')}
     message={t('fasilitator.photos.deleteConfirm')}
     onConfirm={async () => {
      const photo = confirmDeletePhoto
      if (!photo) return
      try {
       // reload bersama (spec §5.1): deletePhoto sudah memuat photos di dalamnya
       await Promise.all([deletePhoto(photo.id), loadPicks()])
       setFullscreenPhoto(null)
      } catch {
       addToast({ type: 'error', message: t('fasilitator.photos.deleteError') })
      } finally {
       setConfirmDeletePhoto(null)
      }
     }}
     onClose={() => setConfirmDeletePhoto(null)}
    />
   </div>
  </div>
 )
}

export default SmartPhotoPage
