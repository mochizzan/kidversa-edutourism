import { useState, useRef, useEffect, useCallback } from 'react'
import { i18n } from '../../../core/i18n'
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
  // 'ended' listeners attached to the tracks of the CURRENT stream, so they
  // can be detached explicitly on any intentional stop/teardown (no leaks).
  const trackListenersRef = useRef<Array<{ track: MediaStreamTrack; handler: () => void }>>([])
  const mountedRef = useRef(true)
  const cancelledRef = useRef(false)

  const [cameraState, setCameraState] = useState<CameraState>('loading')
  // Human-readable reason for the current 'denied'/'error' state — shown in
  // the viewport overlay (the toast alone disappears; the state must not).
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<FacingMode>('environment')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  // Monotonic counter: every restartCamera() bumps it, so the start effect
  // re-runs once per click — even when a previous restart failed and the
  // camera never reaches 'active' again (a boolean flag would stick at true).
  const [restartTick, setRestartTick] = useState(0)

  const clearTrackListeners = useCallback(() => {
    for (const { track, handler } of trackListenersRef.current) {
      track.removeEventListener('ended', handler)
    }
    trackListenersRef.current = []
  }, [])

  // Intentional stop (capture, retake, restart, disable, unmount): detach the
  // 'ended' listeners and null the stream BEFORE stopping the tracks, so
  // neither a synchronously dispatched nor an async 'ended' from a stopped
  // track can be mistaken for a live stream failure.
  const stopStream = useCallback(() => {
    clearTrackListeners()
    const stream = streamRef.current
    streamRef.current = null
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [clearTrackListeners])

  // Live-stream death (device unplugged, OS revoked access, source stalled):
  // a track ends while WE still own the stream. The identity check keeps
  // intentional stops (which null streamRef first) out of this path.
  const handleStreamEnded = useCallback(
    (stream: MediaStream) => {
      if (streamRef.current !== stream) return
      clearTrackListeners()
      streamRef.current = null
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
      const message = i18n.t('fasilitator.camera.errStreamEnded')
      setCameraState('error')
      setCameraErrorMessage(message)
      addToast({ type: 'error', message, duration: 6000 })
    },
    [addToast, clearTrackListeners],
  )

  const attachStream = useCallback(
    (stream: MediaStream) => {
      stream.getTracks().forEach((track) => {
        const handler = () => handleStreamEnded(stream)
        track.addEventListener('ended', handler)
        trackListenersRef.current.push({ track, handler })
      })
    },
    [handleStreamEnded],
  )

  useEffect(() => {
    mountedRef.current = true
    cancelledRef.current = false

    if (!enabled) return

    stopStream()

    const handleCameraError = async (e: DOMException) => {
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices()
        const availableDevices = allDevices.filter((d) => d.kind === 'videoinput')
        if (!mountedRef.current) return
        setDevices(availableDevices)
      } catch (error) {
        console.error('[useCamera] enumerateDevices failed while handling a camera error', error)
      }

      let toastMessage = ''

      switch (e.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          setCameraState('denied')
          toastMessage = i18n.t('fasilitator.camera.errDenied')
          break
        case 'NotReadableError':
          setCameraState('error')
          toastMessage = i18n.t('fasilitator.camera.errBusy')
          break
        case 'NotFoundError':
          setCameraState('error')
          toastMessage = i18n.t('fasilitator.camera.errNotFound')
          break
        case 'OverconstrainedError':
          setCameraState('error')
          toastMessage = i18n.t('fasilitator.camera.errResolution')
          break
        case 'AbortError':
          setCameraState('error')
          toastMessage = i18n.t('fasilitator.camera.errAborted')
          break
        default:
          setCameraState('error')
          toastMessage = i18n.t('fasilitator.camera.errGeneric')
          break
      }

      if (toastMessage) {
        setCameraErrorMessage(toastMessage)
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
      setCameraErrorMessage(null)

      try {
        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices()
          if (!mountedRef.current) return
          setDevices(allDevices.filter((d) => d.kind === 'videoinput'))
        } catch (error) {
          // Fallback: start anyway with the facingMode constraints.
          console.warn('[useCamera] enumerateDevices failed before start', error)
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

        if (gotStream && streamRef.current) {
          attachStream(streamRef.current)
        }

        if (!mountedRef.current) {
          stopStream()
          return
        }

        if (gotStream) {
          // A live-stream 'ended' during the awaits above nulls streamRef —
          // don't clobber its 'error' state with a late 'active'.
          if (streamRef.current) {
            setCameraState('active')
            setCameraErrorMessage(null)
          }
          try {
            const allDevices = await navigator.mediaDevices.enumerateDevices()
            if (!mountedRef.current) return
            const updatedInputs = allDevices.filter((d) => d.kind === 'videoinput')
            if (updatedInputs.length > 0) setDevices(updatedInputs)
          } catch (error) {
            console.warn('[useCamera] post-start device refresh failed', error)
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
      stopStream()
    }
  }, [enabled, facingMode, selectedDeviceId, restartTick, addToast, stopStream, attachStream])

  useEffect(() => {
    if (cameraState !== 'active' || !enabled) return
    if (streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch((error) => {
        // Autoplay rejection leaves the preview frozen — log it for diagnosis.
        console.warn('[useCamera] preview play() rejected', error)
      })
    }
  }, [cameraState, enabled])

  const switchCamera = useCallback(() => {
    setSelectedDeviceId('')
    setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'))
  }, [])

  const selectDevice = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId)
  }, [])

  const restartCamera = useCallback(() => {
    setRestartTick((n) => n + 1)
  }, [])

  return {
    videoRef,
    streamRef,
    cameraState,
    cameraErrorMessage,
    devices,
    selectedDeviceId,
    facingMode,
    switchCamera,
    selectDevice,
    restartCamera,
    stopStream,
  }
}
