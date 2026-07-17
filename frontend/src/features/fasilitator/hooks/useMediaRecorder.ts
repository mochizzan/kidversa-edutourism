import { useState, useRef, useEffect, useCallback } from 'react'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'

const MAX_RETRIES = 3

export type RecorderCameraState = 'loading' | 'active' | 'denied' | 'not-found'

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface UseMediaRecorderOptions {
  maxDuration: number
}

export function useMediaRecorder({ maxDuration }: UseMediaRecorderOptions) {
  const { addToast } = useGlobalToast()

  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [cameraState, setCameraState] = useState<RecorderCameraState>('loading')
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [timer, setTimer] = useState(maxDuration)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [recordingFailed, setRecordingFailed] = useState(false)
  const [error, setError] = useState('')

  const isBrowserSupported = typeof MediaRecorder !== 'undefined'

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

  const startRecording = useCallback(
    async (onEnterPreview: () => void, onEnterRecording: () => void) => {
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
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeType })
          setRecordedBlob(blob)
          onEnterPreview()
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

        recorder.start(1000)
        onEnterRecording()
        setTimer(maxDuration)

        timerRef.current = setInterval(() => {
          setTimer((prev) => {
            if (prev <= 1) {
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
          addToast({
            type: 'error',
            message: 'Izinkan akses kamera dan mikrofon di pengaturan browser untuk melanjutkan.',
            duration: 6000,
          })
        } else if (e.name === 'NotFoundError') {
          setCameraState('not-found')
          setError('Kamera atau mikrofon tidak terdeteksi.')
          addToast({
            type: 'error',
            message: 'Kamera atau mikrofon tidak terdeteksi. Pasang webcam lalu coba lagi.',
            duration: 6000,
          })
        } else {
          setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))
          setCameraState('denied')
          setError('Gagal mengakses kamera atau mikrofon')
          addToast({
            type: 'error',
            message: 'Gagal mengakses kamera atau mikrofon. Periksa koneksi perangkat.',
            duration: 6000,
          })
        }
      }
    },
    [isBrowserSupported, facingMode, maxDuration, addToast],
  )

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

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
  }, [])

  const resetRecorder = useCallback(() => {
    setRecordedBlob(null)
    setRecordingFailed(false)
    setError('')
  }, [])

  const switchFacingMode = useCallback(() => {
    setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))
  }, [])

  return {
    videoRef,
    cameraState,
    timer,
    recordedBlob,
    retryCount,
    recordingFailed,
    error,
    isBrowserSupported,
    maxRetries: MAX_RETRIES,
    startRecording,
    stopRecording,
    cancelRecording,
    resetRecorder,
    switchFacingMode,
    formatTime,
  }
}
