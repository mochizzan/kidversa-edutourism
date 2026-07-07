import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Play,
  Square,
  X,
  Save,
  RotateCcw,
  AlertTriangle,
  ChevronLeft,
  MonitorSmartphone,
  Loader2,
} from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { cn } from '../../../core/utils'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { recordingService } from '../../../core/services/recordings'
import { sessionService } from '../../../core/services/sessions'
import { programService } from '../../../core/services/programs'
import type { Participant } from '../../../core/types'

const MAX_DURATION = 90 // seconds
const MAX_RETRIES = 3

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const RecordingPage = () => {
  const { groupId: _groupId, childId } = useParams<{ groupId: string; childId: string }>()
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()

  /* ── Refs ── */
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* ── Phase ── */
  const [phase, setPhase] = useState<'pre' | 'recording' | 'preview'>('pre')
  const [cameraState, setCameraState] = useState<'loading' | 'active' | 'denied' | 'not-found'>('loading')
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')

  /* ── Recording State ── */
  const [timer, setTimer] = useState(MAX_DURATION)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [recordingFailed, setRecordingFailed] = useState(false)
  const [error, setError] = useState('')
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const [saveError, setSaveError] = useState('')

  /* ── Derived ── */
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [recordingSessionStageId, setRecordingSessionStageId] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (!childId) {
      setDataLoading(false)
      return
    }

    let cancelled = false

    const loadData = async () => {
      try {
        const part = await sessionService.getParticipantById(childId)
        if (cancelled) return
        setParticipant(part)

        if (part?.session_id) {
          const session = await sessionService.getById(part.session_id)
          if (cancelled) return

          if (session) {
            const sessionStages = await sessionService.getStages(part.session_id)
            const programStages = await programService.getStages(session.program_id)
            
            for (const ss of sessionStages) {
              const progStage = programStages.find((ps) => ps.id === ss.program_stage_id)
              if (progStage?.is_recording_stage) {
                setRecordingSessionStageId(ss.id)
                break
              }
            }
          }
        }
      } catch {
        if (!cancelled) setParticipant(null)
      } finally {
        if (!cancelled) setDataLoading(false)
      }
    }

    loadData()
    return () => { cancelled = true }
  }, [childId])

  /* ── Browser Support Check ── */
  const isBrowserSupported = typeof MediaRecorder !== 'undefined'

  /* ── Storage Quota Warning (mock) ── */
  const [storageWarning, setStorageWarning] = useState(false)
  useEffect(() => {
    try {
      // Simple heuristic: if localStorage is >80% full, warn
      let total = 0
      for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
          total += (localStorage.getItem(key)?.length ?? 0) * 2 // UTF-16
        }
      }
      const quota = 5 * 1024 * 1024 // assume 5MB
      if (total > quota * 0.8) {
        setStorageWarning(true)
      }
    } catch {
      // Storage check failed, ignore
    }
  }, [])

  /* ── Cleanup stream on unmount ── */
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  /* ── Start Recording ── */
  const startRecording = useCallback(async () => {
    if (!isBrowserSupported) return
    setError('')
    setRecordingFailed(false)
    setCameraState('loading')

    try {
      const constraints: MediaStreamConstraints = {
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraState('active')

      // Wait a moment for the camera to initialize
      await new Promise((r) => setTimeout(r, 300))

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
          ? 'video/webm;codecs=vp8'
          : 'video/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setRecordedBlob(blob)
        setPhase('preview')
        // Stop the camera
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }

      recorder.onerror = () => {
        setRecordingFailed(true)
        setRetryCount((prev) => prev + 1)
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }

      recorder.start(1000) // collect data every second
      setPhase('recording')
      setTimer(MAX_DURATION)

      // Start countdown
      timerRef.current = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            // Auto-stop
            if (mediaRecorderRef.current?.state === 'recording') {
              mediaRecorderRef.current.stop()
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err: unknown) {
      const e = err as DOMException
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setCameraState('denied')
        setError('Izinkan akses kamera dan mikrofon di pengaturan browser')
        addToast({ type: 'error', message: 'Izinkan akses kamera dan mikrofon di pengaturan browser untuk melanjutkan.', duration: 6000 })
      } else if (e.name === 'NotFoundError') {
        setCameraState('not-found')
        setError('Kamera atau mikrofon tidak terdeteksi.')
        addToast({ type: 'error', message: 'Kamera atau mikrofon tidak terdeteksi. Pasang webcam lalu coba lagi.', duration: 6000 })
      } else {
        // Try the other camera
        setFacingMode(f => f === 'environment' ? 'user' : 'environment')
        setCameraState('denied')
        setError('Gagal mengakses kamera atau mikrofon')
        addToast({ type: 'error', message: 'Gagal mengakses kamera atau mikrofon. Periksa koneksi perangkat.', duration: 6000 })
      }
    }
  }, [isBrowserSupported, facingMode])

  /* ── Stop Recording Early ── */
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  /* ── Cancel Recording (discard) ── */
  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.ondataavailable = null
      mediaRecorderRef.current.onstop = null
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    navigate(-1)
  }, [navigate])

  /* ── Retake Recording ── */
  const retakeRecording = useCallback(() => {
    setRecordedBlob(null)
    setRecordingFailed(false)
    setError('')
    setSaveError('')
    setPhase('pre')
    // Clean up preview video
    if (previewVideoRef.current) {
      previewVideoRef.current.pause()
      previewVideoRef.current.src = ''
    }
  }, [])

  /* ── Save Recording ── */
  const saveRecording = useCallback(async () => {
    if (!recordedBlob || !childId || !recordingSessionStageId) return
    setIsSaving(true)
    setSaveError('')

    try {
      const duration = MAX_DURATION - timer
      const file = new File(
        [recordedBlob],
        `recording-${Date.now()}.webm`,
        { type: recordedBlob.type },
      )

      const recording = await recordingService.upload(childId, recordingSessionStageId, file)
      
      await recordingService.update(recording.id, {
        duration_seconds: Math.max(1, duration),
        file_size_bytes: recordedBlob.size,
      })

      navigate(-1)
    } catch {
      setSaveError('Gagal menyimpan rekaman. Silakan coba lagi.')
    } finally {
      setIsSaving(false)
    }
  }, [recordedBlob, childId, recordingSessionStageId, timer, navigate])

  /* ── Preview playback ── */
  const togglePreview = useCallback(() => {
    if (!previewVideoRef.current || !recordedBlob) return
    if (isPreviewPlaying) {
      previewVideoRef.current.pause()
      setIsPreviewPlaying(false)
    } else {
      const url = URL.createObjectURL(recordedBlob)
      previewVideoRef.current.src = url
      previewVideoRef.current.play()
      setIsPreviewPlaying(true)
      previewVideoRef.current.onended = () => setIsPreviewPlaying(false)
    }
  }, [recordedBlob, isPreviewPlaying])

  /* ── Cleanup blob URL on retake ── */
  useEffect(() => {
    if (phase !== 'preview' && recordedBlob) {
      // Cleanup handled by retake
    }
  }, [phase, recordedBlob])

  /* ══════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════ */

  if (dataLoading) {
    return (
      <div className="h-screen h-dvh flex flex-col items-center justify-center gap-4 p-8 text-center bg-surface text-on-surface">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-on-surface-variant">Memuat data peserta...</p>
      </div>
    )
  }

  if (!participant) {
    return (
      <div className="h-screen h-dvh flex flex-col items-center justify-center gap-4 p-8 text-center bg-surface text-on-surface">
        <AlertTriangle className="w-16 h-16 text-error" />
        <h2 className="text-xl font-bold">Anak Tidak Ditemukan</h2>
        <p className="text-on-surface-variant">Data anak tidak tersedia atau telah dihapus.</p>
        <Button onClick={() => navigate(-1)}>Kembali</Button>
      </div>
    )
  }

  return (
    <div className="h-screen h-dvh flex flex-col bg-black text-white">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-black/80 z-10 shrink-0">
        {phase === 'pre' && (
          <button onClick={() => navigate(-1)} className="p-1 rounded-full hover:bg-white/10">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {phase === 'recording' && (
          <button
            onClick={cancelRecording}
            className="flex items-center gap-1 text-sm text-white/70 hover:text-white"
          >
            <X className="w-5 h-5" />
            Batal
          </button>
        )}
        {phase === 'preview' && (
          <button onClick={retakeRecording} className="p-1 rounded-full hover:bg-white/10">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <h1 className="text-sm font-semibold">
          {phase === 'pre' && 'Rekam Refleksi'}
          {phase === 'recording' && 'Merekam...'}
          {phase === 'preview' && 'Preview Rekaman'}
        </h1>

        {/* Recording indicator */}
        {phase === 'recording' && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
            <span className="text-xs text-error font-medium">LIVE</span>
          </div>
        )}
        {phase !== 'recording' && <div className="w-14" /> /* spacer */}
      </header>

      {/* ── Error / Warning Banners ── */}
      {(error || saveError) && (
        <div className="flex items-center gap-2 px-4 py-2 bg-error/80 text-white text-sm shrink-0">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error || saveError}</span>
        </div>
      )}
      {storageWarning && phase === 'pre' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-warning/90 text-white text-sm shrink-0">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Penyimpanan hampir penuh. Hapus rekaman lama untuk melanjutkan.</span>
        </div>
      )}

      {/* ═══════════════════════════════════════
          PHASE: PRE-RECORDING
          ═══════════════════════════════════════ */}
      {phase === 'pre' && (
        <div className="flex-1 flex flex-col bg-surface text-on-surface overflow-y-auto">
          <div className="flex-1 p-6 space-y-6">
            {/* Child Info */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary-container flex items-center justify-center text-2xl font-bold text-primary shrink-0">
                {participant.child_name.charAt(0)}
              </div>
              <div>
                <h2 className="text-xl font-bold">{participant.child_name}</h2>
                <p className="text-sm text-on-surface-variant">
                  Usia: {participant.child_age} tahun
                </p>
              </div>
            </div>

            {/* Reflection Question */}
            <div className="bg-primary-container rounded-2xl p-5">
              <p className="text-sm text-primary/60 font-medium mb-2">Pertanyaan Refleksi</p>
              <p className="text-lg font-semibold text-primary">
                "Apa yang paling kamu suka hari ini?"
              </p>
            </div>

            {/* Info Tips */}
            <div className="flex items-start gap-3 bg-surface-container-low rounded-2xl p-4">
              <MonitorSmartphone className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-on-surface">Tips Perekaman</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Arahkan kamera belakang ke wajah anak agar ekspresi terekam dengan jelas. Pastikan
                  pencahayaan cukup dan suara latar tidak terlalu bising.
                </p>
              </div>
            </div>

            {/* Consent Gate */}
            {!participant.consent_recording && (
              <div className="bg-error-container rounded-2xl p-5 text-center">
                <AlertTriangle className="w-10 h-10 text-error mx-auto mb-3" />
                <h3 className="font-semibold text-on-error-container mb-1">Izin Rekaman Belum Ada</h3>
                <p className="text-sm text-on-error-container/70">
                  Orang tua/wali {participant.child_name} belum memberikan izin untuk perekaman
                  video. Rekaman tidak dapat dilakukan tanpa izin.
                </p>
              </div>
            )}

            {/* Browser Not Supported */}
            {!isBrowserSupported && (
              <div className="bg-warning/10 border border-warning/30 rounded-2xl p-5 text-center">
                <AlertTriangle className="w-10 h-10 text-warning mx-auto mb-3" />
                <h3 className="font-semibold text-warning mb-1">Browser Tidak Didukung</h3>
                <p className="text-sm text-on-surface-variant">
                  Browser Anda tidak mendukung perekaman video. Gunakan Chrome, Firefox, atau Edge
                  versi terbaru.
                </p>
              </div>
            )}
          </div>

          {/* Start Button */}
          <div className="shrink-0 px-6 py-4 border-t border-outline-variant bg-surface">
            <Button
              className="w-full"
              size="lg"
              disabled={
                !participant.consent_recording || !isBrowserSupported || isSaving
              }
              onClick={startRecording}
              icon={
                <span className="w-3 h-3 rounded-full bg-white inline-block" />
              }
            >
              MULAI REKAM
            </Button>
            {!participant.consent_recording && (
              <p className="text-[11px] text-on-surface-variant text-center mt-2">
                Izin rekaman diperlukan untuk memulai
              </p>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          PHASE: RECORDING
          ═══════════════════════════════════════ */}
      {phase === 'recording' && (
        <div className="flex-1 relative">
          {/* Camera Loading */}
          {cameraState === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-white" />
                <p className="text-sm text-white/70">Mengakses kamera...</p>
              </div>
            </div>
          )}

          {/* Recording Failure (retry) */}
          {recordingFailed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 bg-surface text-on-surface text-center">
              <AlertTriangle className="w-16 h-16 text-error" />
              <h3 className="font-semibold text-lg">Rekaman Gagal</h3>
              <p className="text-sm text-on-surface-variant">
                Terjadi kesalahan saat merekam.
                {retryCount < MAX_RETRIES
                  ? ` Silakan coba lagi (${retryCount}/${MAX_RETRIES}).`
                  : ' Batas percobaan tercapai.'}
              </p>
              {retryCount < MAX_RETRIES ? (
                <Button onClick={startRecording} icon={<RotateCcw className="w-4 h-4" />}>
                  Coba Lagi
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => navigate(-1)}>
                  Kembali
                </Button>
              )}
            </div>
          )}

          {/* Camera Active + Recording UI */}
          {cameraState === 'active' && !recordingFailed && (
            <>
              {/* Video Preview */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Timer Overlay */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 rounded-full px-4 py-1.5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
                <span className="text-lg font-mono font-bold tracking-wider">
                  {formatTime(timer)}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="absolute top-16 left-4 right-4">
                <div className="w-full bg-white/20 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-1000 ease-linear',
                      timer <= 5 ? 'bg-error' : 'bg-primary',
                    )}
                    style={{
                      width: `${((MAX_DURATION - timer) / MAX_DURATION) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* Flash Red Border (last 5 seconds) */}
              {timer <= 5 && timer > 0 && (
                <div className="absolute inset-0 border-[6px] border-error rounded-2xl animate-pulse pointer-events-none" />
              )}

              {/* Bottom Controls */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-6 pb-8 pt-12">
                <div className="flex items-center justify-center gap-6">
                  <button
                    onClick={cancelRecording}
                    className="flex flex-col items-center gap-1 text-white/70"
                  >
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                      <X className="w-5 h-5" />
                    </div>
                    <span className="text-[10px]">Batal</span>
                  </button>

                  <button
                    onClick={stopRecording}
                    className="w-16 h-16 rounded-full bg-white flex items-center justify-center active:scale-95 transition-transform"
                  >
                    <Square className="w-7 h-7 text-error fill-error" />
                  </button>

                  {/* Camera Switch */}
                  <button
                    onClick={() => setFacingMode(f => f === 'environment' ? 'user' : 'environment')}
                    className="flex flex-col items-center gap-1 text-white/70"
                  >
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
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
      )}

      {/* ═══════════════════════════════════════
          PHASE: PREVIEW
          ═══════════════════════════════════════ */}
      {phase === 'preview' && (
        <div className="flex-1 flex flex-col bg-surface text-on-surface">
          {/* Video Preview Area */}
          <div className="flex-1 bg-black flex items-center justify-center relative">
            {recordedBlob ? (
              <video
                ref={previewVideoRef}
                controls
                className="max-w-full max-h-full"
                onEnded={() => setIsPreviewPlaying(false)}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-white/50">
                <AlertTriangle className="w-8 h-8" />
                <p className="text-sm">Rekaman tidak tersedia</p>
              </div>
            )}

            {/* Duration Badge */}
            {recordedBlob && (
              <div className="absolute top-3 left-3 bg-black/70 rounded-full px-3 py-1 text-xs font-mono">
                {formatTime(Math.max(1, MAX_DURATION - timer))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="shrink-0 px-6 py-4 border-t border-outline-variant space-y-3">
            {/* Preview Toggle */}
            {recordedBlob && (
              <Button
                variant="secondary"
                className="w-full"
                icon={isPreviewPlaying ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                onClick={togglePreview}
              >
                {isPreviewPlaying ? 'Berhenti' : 'Preview'}
              </Button>
            )}

            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                icon={<RotateCcw className="w-4 h-4" />}
                onClick={retakeRecording}
              >
                Rekam Ulang
              </Button>
              <Button
                className="flex-1"
                loading={isSaving}
                icon={<Save className="w-4 h-4" />}
                onClick={saveRecording}
                disabled={!recordedBlob}
              >
                Simpan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RecordingPage
