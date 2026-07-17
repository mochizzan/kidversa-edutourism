import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { X, AlertTriangle, ChevronLeft, Loader2 } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { recordingService } from '../../../core/services/recordings'
import { sessionService } from '../../../core/services/sessions'
import { programService } from '../../../core/services/programs'
import { useMediaRecorder } from '../hooks/useMediaRecorder'
import { PreRecordingView } from '../components/PreRecordingView'
import { RecordingView } from '../components/RecordingView'
import { PreviewView } from '../components/PreviewView'
import type { Participant } from '../../../core/types'

const MAX_DURATION = 90 // seconds

const RecordingPage = () => {
  const { childId } = useParams<{ groupId: string; childId: string }>()
  const navigate = useNavigate()

  const previewVideoRef = useRef<HTMLVideoElement>(null)

  const [phase, setPhase] = useState<'pre' | 'recording' | 'preview'>('pre')
  const [isSaving, setIsSaving] = useState(false)
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [storageWarning, setStorageWarning] = useState(false)

  const [participant, setParticipant] = useState<Participant | null>(null)
  const [recordingSessionStageId, setRecordingSessionStageId] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(true)

  const {
    videoRef,
    cameraState,
    timer,
    recordedBlob,
    retryCount,
    recordingFailed,
    error,
    isBrowserSupported,
    maxRetries,
    startRecording,
    stopRecording,
    cancelRecording,
    resetRecorder,
    switchFacingMode,
    formatTime,
  } = useMediaRecorder({ maxDuration: MAX_DURATION })

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
    return () => {
      cancelled = true
    }
  }, [childId])

  useEffect(() => {
    try {
      let total = 0
      for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
          total += (localStorage.getItem(key)?.length ?? 0) * 2
        }
      }
      const quota = 5 * 1024 * 1024
      if (total > quota * 0.8) setStorageWarning(true)
    } catch {
      // ignore
    }
  }, [])

  const handleStart = useCallback(() => {
    startRecording(
      () => setPhase('preview'),
      () => setPhase('recording'),
    )
  }, [startRecording])

  const handleCancel = useCallback(() => {
    cancelRecording()
    navigate(-1)
  }, [cancelRecording, navigate])

  const handleRetake = useCallback(() => {
    resetRecorder()
    setSaveError('')
    setPhase('pre')
    if (previewVideoRef.current) {
      previewVideoRef.current.pause()
      previewVideoRef.current.src = ''
    }
  }, [resetRecorder])

  const handleSave = useCallback(async () => {
    if (!recordedBlob || !childId || !recordingSessionStageId) return
    setIsSaving(true)
    setSaveError('')
    try {
      const duration = MAX_DURATION - timer
      const file = new File([recordedBlob], `recording-${Date.now()}.webm`, {
        type: recordedBlob.type,
      })
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
      <header className="flex items-center justify-between px-4 py-3 bg-black/80 z-10 shrink-0">
        {phase === 'pre' && (
          <button onClick={() => navigate(-1)} className="p-1 rounded-full hover:bg-white/10">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {phase === 'recording' && (
          <button
            onClick={handleCancel}
            className="flex items-center gap-1 text-sm text-white/70 hover:text-white"
          >
            <X className="w-5 h-5" />
            Batal
          </button>
        )}
        {phase === 'preview' && (
          <button onClick={handleRetake} className="p-1 rounded-full hover:bg-white/10">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <h1 className="text-sm font-semibold">
          {phase === 'pre' && 'Rekam Refleksi'}
          {phase === 'recording' && 'Merekam...'}
          {phase === 'preview' && 'Preview Rekaman'}
        </h1>

        {phase === 'recording' && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
            <span className="text-xs text-error font-medium">LIVE</span>
          </div>
        )}
        {phase !== 'recording' && <div className="w-14" />}
      </header>

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

      {phase === 'pre' && (
        <PreRecordingView
          participant={participant}
          isBrowserSupported={isBrowserSupported}
          isSaving={isSaving}
          onStart={handleStart}
        />
      )}

      {phase === 'recording' && (
        <RecordingView
          videoRef={videoRef}
          cameraState={cameraState}
          recordingFailed={recordingFailed}
          retryCount={retryCount}
          maxRetries={maxRetries}
          timer={timer}
          maxDuration={MAX_DURATION}
          formatTime={formatTime}
          onStop={stopRecording}
          onCancel={handleCancel}
          onSwitchCamera={switchFacingMode}
          onRetry={handleStart}
          onBack={() => navigate(-1)}
        />
      )}

      {phase === 'preview' && (
        <PreviewView
          previewVideoRef={previewVideoRef}
          recordedBlob={recordedBlob}
          isPreviewPlaying={isPreviewPlaying}
          isSaving={isSaving}
          timer={timer}
          maxDuration={MAX_DURATION}
          formatTime={formatTime}
          onTogglePreview={togglePreview}
          onRetake={handleRetake}
          onSave={handleSave}
          onPreviewEnded={() => setIsPreviewPlaying(false)}
        />
      )}
    </div>
  )
}

export default RecordingPage
