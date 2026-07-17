import { useState, useRef, useEffect, useCallback } from 'react'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'

export type CameraState = 'loading' | 'active' | 'denied' | 'error'
export type FacingMode = 'environment' | 'user'

interface UseCameraOptions {
  enabled: boolean
}

export function useCamera({ enabled }: UseCameraOptions) {
  const { addToast } = useGlobalToast()

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mountedRef = useRef(true)
  const cancelledRef = useRef(false)

  const [cameraState, setCameraState] = useState<CameraState>('loading')
  const [facingMode, setFacingMode] = useState<FacingMode>('environment')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [needsCameraRestart, setNeedsCameraRestart] = useState(false)

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    cancelledRef.current = false

    if (!enabled) return

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    const handleCameraError = async (e: DOMException) => {
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices()
        const availableDevices = allDevices.filter((d) => d.kind === 'videoinput')
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
          type:
            e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError'
              ? 'error'
              : 'warning',
          message: toastMessage,
          duration: 6000,
        })
      }
    }

    const start = async () => {
      setCameraState('loading')

      try {
        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices()
          if (!mountedRef.current) return
          setDevices(allDevices.filter((d) => d.kind === 'videoinput'))
        } catch {
          // fallback
        }

        const idealRes = { width: { ideal: 1280 }, height: { ideal: 720 } }
        const constraintsToTry: MediaTrackConstraints[] = []

        if (selectedDeviceId) {
          constraintsToTry.push({ deviceId: { exact: selectedDeviceId }, ...idealRes })
        } else {
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
            streamRef.current.getTracks().forEach((t) => t.stop())
            streamRef.current = null
          }
          return
        }

        if (gotStream) {
          setCameraState('active')
          try {
            const allDevices = await navigator.mediaDevices.enumerateDevices()
            if (!mountedRef.current) return
            const updatedInputs = allDevices.filter((d) => d.kind === 'videoinput')
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

    start()

    return () => {
      mountedRef.current = false
      cancelledRef.current = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }
  }, [enabled, facingMode, selectedDeviceId, needsCameraRestart, addToast])

  useEffect(() => {
    if (cameraState !== 'active' || !enabled) return
    if (streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [cameraState, enabled])

  useEffect(() => {
    if (needsCameraRestart && cameraState === 'active') {
      setNeedsCameraRestart(false)
    }
  }, [needsCameraRestart, cameraState])

  const switchCamera = useCallback(() => {
    setSelectedDeviceId('')
    setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))
  }, [])

  const selectDevice = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId)
  }, [])

  const restartCamera = useCallback(() => {
    setNeedsCameraRestart(true)
  }, [])

  return {
    videoRef,
    streamRef,
    cameraState,
    devices,
    selectedDeviceId,
    facingMode,
    switchCamera,
    selectDevice,
    restartCamera,
    stopStream,
  }
}
