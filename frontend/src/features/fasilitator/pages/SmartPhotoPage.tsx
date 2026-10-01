import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronLeft, Lock } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Modal } from '../../../shared/components/ui/Modal'
import { getMediaUrl } from '../../../core/utils/media'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { friendlyError } from '../../../core/utils/errorMessages'
import { frameService } from '../../../core/services/frames'
import { sessionService } from '../../../core/services/sessions'
import { useAuthStore } from '../../../core/stores/authStore'
import { ROUTES } from '../../../core/constants/app'
import { useCamera } from '../hooks/useCamera'
import { useSmartPhotos } from '../hooks/useSmartPhotos'
import { useGroupOwnership } from '../hooks/useGroupOwnership'
import { CameraViewport } from '../components/CameraViewport'
import { CameraSettings } from '../components/CameraSettings'
import { PhotoEditor } from '../components/PhotoEditor'
import { FramePicker } from '../components/FramePicker'
import { computeCaptureCrop, composePhoto, drawVideoCrop } from '../utils/photoCapture'
import type { PhotoFrame, Participant } from '../../../core/types'

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
 const { addToast, removeToast } = useGlobalToast()
 const { session, isMine } = useGroupOwnership(childId)
 // Frame ownership: FramePicker filters RAW frames down to the ones allowed
 // for this program (undefined session → global-only frames, fails closed).
 const programId = session?.program_id

 const captureCanvasRef = useRef<HTMLCanvasElement>(null)
 const editorCanvasRef = useRef<HTMLCanvasElement>(null)
 // Id of the frame actually drawn into the editor canvas (null = frame-free
 // base). Kept in sync with the canvas pixels by the compose effect so the
 // uploaded `frame_id` always matches what is inside the saved PNG.
 const composedFrameIdRef = useRef<string | null>(null)

 const [phase, setPhase] = useState<'camera' | 'editor'>('camera')
 const [pageError, setPageError] = useState<string | null>(null)
 const [cameraPickerOpen, setCameraPickerOpen] = useState(false)
 const [showGrid, setShowGrid] = useState(false)
 // Horizontally mirror the preview; the capture flips identically so the
 // saved photo always matches what the user saw. Persists across retakes.
 const [mirror, setMirror] = useState(false)

 const [frames, setFrames] = useState<PhotoFrame[]>([])
 const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null)
 const [capturedPhotoDataUrl, setCapturedPhotoDataUrl] = useState<string | null>(null)

 const [isReportPhoto, setIsReportPhoto] = useState(false)
 const [isSaving, setIsSaving] = useState(false)

 // Konfirmasi ke-2 (native): while an upload is in flight, block accidental
 // tab close/reload. The in-app confirm guards deliberate navigation instead.
 useEffect(() => {
  if (!isSaving) return
  const handler = (e: BeforeUnloadEvent) => {
   e.preventDefault()
  }
  window.addEventListener('beforeunload', handler)
  return () => window.removeEventListener('beforeunload', handler)
 }, [isSaving])

 const [framePickerOpen, setFramePickerOpen] = useState(false)

 const [participant, setParticipant] = useState<Participant | null>(null)
 const [participantError, setParticipantError] = useState<string | null>(null)
 const [dataLoading, setDataLoading] = useState(true)
 const loadCancelledRef = useRef(false)

 // Ref-stable snapshots for handleSave to avoid stale closure.
 const participantRef = useStableRef(participant)
 const isMineRef = useStableRef(isMine)

 const {
  videoRef,
  cameraState,
  cameraErrorMessage,
  devices,
  selectedDeviceId,
  selectDevice,
  restartCamera,
  stopStream,
 } = useCamera({ enabled: phase === 'camera' && !!participant?.consent_photo })

 const { photos, loadPhotos, uploadPhoto } = useSmartPhotos(childId, participant)

 const loadParticipant = useCallback(async () => {
  if (!childId) return
  loadCancelledRef.current = false
  // A null return is a 404 (childMissing screen); a rejection is a
  // network/server failure — surfaced as its own error state with retry.
  setParticipantError(null)
  try {
   const part = await sessionService.getParticipantById(childId)
   if (loadCancelledRef.current) return
   setParticipant(part)
  } catch (err) {
   if (!loadCancelledRef.current) {
    setParticipant(null)
    setParticipantError(friendlyError(err))
   }
  } finally {
   if (!loadCancelledRef.current) setDataLoading(false)
  }
 }, [childId])

 const retryParticipant = useCallback(() => {
  setDataLoading(true)
  void loadParticipant()
 }, [loadParticipant])

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
    // RAW frames (active + inactive): FramePicker filters internally by
    // program ownership and activation via filterFramesForProgram.
    setFrames(res.data)
   })
   .catch(() => {
    setPageError(t('fasilitator.photos.frameLoadError'))
   })
  if (childId) {
   loadPhotos().catch(() => {
    setPageError(t('fasilitator.photos.photoLoadError'))
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
  const compose = async () => {
   try {
    const baseImg = await loadImage(capturedPhotoDataUrl)
    if (cancelled) return
    canvas.width = baseImg.width
    canvas.height = baseImg.height
    // Always recompose from the frame-free base: changing or clearing the
    // frame redraws base (+ frame) instead of stacking a frame on top of an
    // already-composed image — the canvas holds ONE whole photo at all times.
    composePhoto(ctx, { base: baseImg })
    composedFrameIdRef.current = null
    if (!selectedFrameId) return
    const frame = frames.find((f) => f.id === selectedFrameId)
    if (!frame?.file_url) {
     // Selected frame has no image to draw — never a silent path: warn and
     // fall back to the frame-free base (already on the canvas).
     console.warn('[SmartPhotoPage] selected frame has no image; saving frame-free', selectedFrameId)
     addToast({ type: 'warning', message: t('fasilitator.photos.frameFallbackToast') })
     return
    }
    try {
     const frameImg = await loadImage(getMediaUrl('frame', frame.id))
     if (cancelled) return
     composePhoto(ctx, { base: baseImg, frame: frameImg })
     composedFrameIdRef.current = frame.id
    } catch (err) {
     if (!cancelled) {
      console.warn('[SmartPhotoPage] frame image failed to load; saving frame-free', err)
      addToast({ type: 'warning', message: t('fasilitator.photos.frameFallbackToast') })
     }
    }
   } catch (err) {
    if (!cancelled) {
     console.error('[SmartPhotoPage] failed to compose the captured photo', err)
     addToast({ type: 'error', message: t('fasilitator.photos.composeError') })
    }
   }
  }
  compose()
  return () => {
   cancelled = true
  }
 }, [phase, capturedPhotoDataUrl, selectedFrameId, frames])

 const takePhoto = useCallback(() => {
  if (!videoRef.current || !captureCanvasRef.current || !user || !isMine) return
  const video = videoRef.current
  const canvas = captureCanvasRef.current
  // Always a centered 9:16 crop of the video, regardless of viewport size.
  const crop = computeCaptureCrop(video.videoWidth, video.videoHeight)

  canvas.width = crop.sw
  canvas.height = crop.sh
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  drawVideoCrop(ctx, video, crop, mirror)
  // Lossless PNG snapshot: the editor may re-compose (frame overlay) and the
  // upload sends PNG — JPEG re-encoding here would double-lossy the pixels.
  const dataUrl = canvas.toDataURL('image/png')
  composedFrameIdRef.current = null
  setCapturedPhotoDataUrl(dataUrl)
  setPhase('editor')
  setIsReportPhoto(false)

  // Intentional stop: the hook detaches its stream-death listeners and nulls
  // the stream before stopping the tracks, so ending the preview here can
  // never surface as a live-stream error toast.
  stopStream()
 }, [user, isMine, videoRef, stopStream, mirror])

 const handleRetake = useCallback(() => {
  setCapturedPhotoDataUrl(null)
  setSelectedFrameId(null)
  setIsReportPhoto(false)
  restartCamera()
  setPhase('camera')
 }, [restartCamera])

 const handleDiscard = useCallback(() => {
  // Konfirmasi ke-1 (in-app): abandoning a running upload discards it.
  if (isSaving && !window.confirm(t('fasilitator.photos.leaveUploadConfirm'))) return
  setCapturedPhotoDataUrl(null)
  setSelectedFrameId(null)
  setIsReportPhoto(false)
  navigate(-1)
 }, [navigate, isSaving, t])

 const handleSave = useCallback(async () => {
  // Read from refs so we always see the LATEST values — avoids the stale
  // closure bug where `participant` was captured as null on first render.
  const currentParticipant = participantRef.current
  const currentIsMine = isMineRef.current
  if (!editorCanvasRef.current || !childId || !currentParticipant || !user || !currentIsMine) {
   // Defensive guard, not a user-reachable error: the editor only renders
   // with a participant/canvas. Logged so a future regression isn't silent.
   console.warn('[SmartPhotoPage] save skipped: editor context not ready', {
    hasCanvas: !!editorCanvasRef.current,
    hasChildId: !!childId,
    hasParticipant: !!currentParticipant,
    hasUser: !!user,
    isMine: currentIsMine,
   })
   return
  }
  if (!currentParticipant.session_id) {
   addToast({ type: 'error', message: t('fasilitator.photos.notInSession') })
   return
  }
  setIsSaving(true)
  // Upload toast lifecycle lives in the GLOBAL toast store (not component
  // state), so it keeps updating and can be cleared even if this page
  // unmounts mid-upload. Every path removes the uploading toast in finally.
  let uploadingToastId: string | null = null
  let lastProgressAt = 0
  try {
   // `frame_id` must match the pixels being blobbed: only the frame that was
   // really composed into the canvas is reported (null = frame-free base).
   // Reading the ref and starting toBlob happen in the same synchronous
   // block, so a late frame load can't desync metadata from the image.
   const frameId = composedFrameIdRef.current
   const blob = await new Promise<Blob | null>((resolve) =>
    editorCanvasRef.current!.toBlob(resolve, 'image/png'),
   )
   if (!blob) throw new Error('Gagal mengkonversi gambar')

   // Persistent (duration 0) until replaced by a progress update or removed
   // in finally — the server response is the ONLY source of final status.
   uploadingToastId = addToast({
    type: 'info',
    message: t('fasilitator.photos.uploading'),
    duration: 0,
   })
   await uploadPhoto(
    {
     childId,
     participant: currentParticipant,
     takenBy: user.id,
     blob,
     frameId,
     isReportPhoto,
    },
    {
     onProgress: (percent: number) => {
      // Throttle refreshes to ≥500ms; removeToast first so the next addToast
      // isn't de-duped against an identical rapid-fire message.
      const now = Date.now()
      if (now - lastProgressAt < 500) return
      lastProgressAt = now
      if (uploadingToastId) removeToast(uploadingToastId)
      uploadingToastId = addToast({
       type: 'info',
       message: t('fasilitator.photos.uploadProgress', { percent }),
       duration: 0,
      })
     },
    },
   )

   // Saved: reset the editor and stand the camera back up for the next photo.
   // Deliberately NO navigate() — the gallery opens via its own button.
   setCapturedPhotoDataUrl(null)
   setSelectedFrameId(null)
   setIsReportPhoto(false)
   setPhase('camera')
   addToast({ type: 'success', message: t('fasilitator.photos.uploadSuccess') })
  } catch (err: unknown) {
   const e = err as Error & { code?: string }
   if (e.message === 'MAX_PHOTOS_REACHED') {
    addToast({ type: 'error', message: t('fasilitator.photos.maxPhotos', { max: MAX_PHOTOS }) })
   } else if (e.code === 'consent_required') {
    // Toast only — no navigate(-1): the user stays put with the capture intact.
    addToast({ type: 'error', message: t('fasilitator.photos.consentRequired') })
   } else {
    // Surface the backend's readable message (validation codes, file gates…)
    // with friendlyError's errors.<code>/default fallbacks. Also covers
    // failures thrown BEFORE uploadPhoto starts (e.g. toBlob) — no path may
    // exit handleSave silently.
    addToast({ type: 'error', message: friendlyError(err) })
   }
  } finally {
   if (uploadingToastId) removeToast(uploadingToastId)
   setIsSaving(false)
  }
 }, [childId, user, isReportPhoto, uploadPhoto, addToast, removeToast, t])

 const handleBack = useCallback(() => {
  if (phase === 'editor') {
   handleRetake()
   return
  }
  // Konfirmasi ke-1 (in-app): leaving mid-upload discards the upload.
  if (isSaving && !window.confirm(t('fasilitator.photos.leaveUploadConfirm'))) return
  navigate(-1)
 }, [phase, navigate, handleRetake, isSaving, t])

 const currentCameraLabel = (() => {
  if (!selectedDeviceId) return t('fasilitator.camera.auto')
  const device = devices.find((d) => d.deviceId === selectedDeviceId)
  return device?.label || t('fasilitator.camera.deviceFallback')
 })()

 const photoCount = photos.length
 const isMaxPhotos = photoCount >= MAX_PHOTOS

 if (dataLoading) {
  return (
   <div className="h-dvh flex flex-col items-center justify-center gap-4 p-8 text-center bg-surface-container-low text-on-surface">
    <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
    <p className="text-sm text-on-surface-variant">{t('fasilitator.photos.loadingParticipant')}</p>
   </div>
  )
 }

 // ── Participant fetch failed (network/server) — error state with retry ──
 if (participantError) {
  return (
   <div className="h-dvh flex flex-col items-center justify-center gap-4 p-8 text-center bg-surface-container-low text-on-surface">
    <AlertTriangle className="w-16 h-16 text-error" />
    <h2 className="text-xl font-bold">{t('common.error.title')}</h2>
    <p className="text-on-surface-variant">{participantError}</p>
    <div className="flex gap-3">
     <Button onClick={() => navigate(-1)}>{t('common.back')}</Button>
     <Button variant="secondary" onClick={retryParticipant}>{t('fasilitator.photos.retry')}</Button>
    </div>
   </div>
  )
 }

 if (!participant) {
  return (
   <div className="h-dvh flex flex-col items-center justify-center gap-4 p-8 text-center bg-surface-container-low text-on-surface">
    <AlertTriangle className="w-16 h-16 text-error" />
    <h2 className="text-xl font-bold">{t('fasilitator.photos.childMissingTitle')}</h2>
    <p className="text-on-surface-variant">{t('fasilitator.photos.childMissingDesc')}</p>
    <div className="flex gap-3">
     <Button onClick={() => navigate(-1)}>{t('common.back')}</Button>
     <Button variant="secondary" onClick={retryParticipant}>{t('fasilitator.photos.retry')}</Button>
    </div>
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

    {/* Editor host: the wrapper has NO overflow-hidden — it is the
        positioning context the right-side control column anchors to —
        while the inner aspect box clips the camera/editor pixels. The
        pr-16 gutter keeps that column beside the canvas, never over it. */}
    <div className="relative w-full max-w-[min(56.25dvh,56rem)] mx-auto pr-16">
     <div className="relative aspect-[9/16] w-full rounded-3xl overflow-hidden bg-black shadow-md border border-slate-200">
      {phase === 'camera' && (
       <CameraViewport
        videoRef={videoRef}
        cameraState={cameraState}
        cameraErrorMessage={cameraErrorMessage}
        onRetryCamera={restartCamera}
        showGrid={showGrid}
        pageError={pageError}
        onRetryLoad={() => {
         setPageError(null)
         loadInitialData()
        }}
        participant={participant}
        devices={devices}
        selectedDeviceId={selectedDeviceId}
        currentCameraLabel={currentCameraLabel}
        cameraPickerOpen={cameraPickerOpen}
        onToggleCameraPicker={() => setCameraPickerOpen((v) => !v)}
        onCloseCameraPicker={() => setCameraPickerOpen(false)}
        onDeviceChange={selectDevice}
        mirror={mirror}
        photoCount={photoCount}
        maxPhotos={MAX_PHOTOS}
        isMaxPhotos={isMaxPhotos}
        onTakePhoto={takePhoto}
        onOpenGallery={() => {
         if (childId) navigate(ROUTES.FASILITATOR.GALERI_CHILD(childId))
        }}
        onOpenFramePicker={() => setFramePickerOpen(true)}
        disabled={!isMine}
       />
      )}

      {phase === 'camera' && selectedFrameId && (
       <img
        src={getMediaUrl('frame', selectedFrameId)}
        alt=""
        className="absolute inset-0 w-full h-full object-fill z-[6] pointer-events-none"
        onError={() => addToast({ type: 'warning', message: t('fasilitator.photos.frameFallbackToast') })}
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

     {/* Right-side control column (in the wrapper's gutter, outside the
         canvas box): the settings gear during the camera phase. */}
     {phase === 'camera' && (
      <CameraSettings
       disabled={cameraState !== 'active'}
       showGrid={showGrid}
       mirror={mirror}
       onToggleGrid={() => setShowGrid((v) => !v)}
       onToggleMirror={() => setMirror((v) => !v)}
      />
     )}

     {/* Mount only once a photo exists: no editor controls (e.g. the report
         photo toggle) before there is anything to edit. */}
     {phase === 'editor' && capturedPhotoDataUrl && (
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
    </div>

    <Modal
     open={framePickerOpen}
     onClose={() => setFramePickerOpen(false)}
     title={t('fasilitator.photos.chooseFrame')}
     size="md"
    >
     <FramePicker
      frames={frames}
      programId={programId}
      selectedFrameId={selectedFrameId}
      onSelect={(id) => {
       setSelectedFrameId(id)
       setFramePickerOpen(false)
      }}
     />
    </Modal>
   </div>
  </div>
 )
}

export default SmartPhotoPage
