import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { renderHook } from './test-utils'
import { useCamera } from '../../src/features/fasilitator/hooks/useCamera'
import { useToastStore } from '../../src/core/stores/toastStore'
import { i18n } from '../../src/core/i18n'

/**
 * Headless edge cases for the camera hook:
 * - permission denied → 'denied' state + reason + toast
 * - live stream death ('ended') → 'error' state + reason + toast
 * - intentional stops (capture/retake/restart/unmount) → NEVER an error
 */

/** Video track stand-in with inspectable 'ended' listener bookkeeping. */
class FakeTrack extends EventTarget {
 readyState: 'live' | 'ended' = 'live'
 readonly endedListeners = new Set<EventListener>()

 override addEventListener(
  type: string,
  handler: EventListenerOrEventListenerObject | null,
  options?: boolean | AddEventListenerOptions,
 ): void {
  if (type === 'ended' && typeof handler === 'function') this.endedListeners.add(handler)
  super.addEventListener(type, handler, options)
 }

 override removeEventListener(
  type: string,
  handler: EventListenerOrEventListenerObject | null,
  options?: boolean | EventListenerOptions,
 ): void {
  if (type === 'ended' && typeof handler === 'function') this.endedListeners.delete(handler)
  super.removeEventListener(type, handler, options)
 }

 /**
  * Deliberately misbehaving source: dispatches 'ended' SYNCHRONOUSLY on
  * stop(). Per spec stop() must not fire 'ended', so a correct hook detaches
  * its listeners before stopping — this makes a listener leak or an
  * intentional-stop-treated-as-failure bug fail these tests loudly.
  */
 stop(): void {
  this.readyState = 'ended'
  this.dispatchEvent(new Event('ended'))
 }

 emitEnded(): void {
  this.readyState = 'ended'
  this.dispatchEvent(new Event('ended'))
 }
}

class FakeStream {
 constructor(private readonly tracks: FakeTrack[]) { }
 getTracks(): FakeTrack[] {
  return this.tracks
 }
}

function installMediaDevices(getUserMedia: (constraints?: MediaStreamConstraints) => Promise<MediaStream>) {
 Object.defineProperty(navigator, 'mediaDevices', {
  configurable: true,
  value: {
   getUserMedia,
   enumerateDevices: vi.fn().mockResolvedValue([]),
  },
 })
}

/**
 * Deterministic flush (no wall-clock timers): start() is one long chain of
 * microtask-only awaits, so draining microtask generations settles it fully.
 */
async function flush() {
 await act(async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve()
 })
}

function toasts() {
 return useToastStore.getState().toasts
}

beforeEach(() => {
 useToastStore.setState({ toasts: [] })
})

afterEach(() => {
 Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('useCamera: permission denied', () => {
 it('NotAllowedError → denied state, recorded reason, and an error toast', async () => {
  installMediaDevices(
   vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')),
  )

  const { result } = renderHook(() => useCamera({ enabled: true }))
  await flush()

  expect(result.current.cameraState).toBe('denied')
  expect(result.current.cameraErrorMessage).toBe(i18n.t('fasilitator.camera.errDenied'))
  expect(
   toasts().some(
    (t) => t.type === 'error' && t.message === i18n.t('fasilitator.camera.errDenied'),
   ),
  ).toBe(true)
 })
})

describe('useCamera: stream dies mid-session', () => {
 it("a track's 'ended' → error state, recorded reason, toast, listeners detached", async () => {
  const track = new FakeTrack()
  const stream = new FakeStream([track])
  installMediaDevices(vi.fn().mockResolvedValue(stream))

  const { result } = renderHook(() => useCamera({ enabled: true }))
  await flush()

  expect(result.current.cameraState).toBe('active')
  expect(track.endedListeners.size).toBe(1)

  act(() => {
   track.emitEnded()
  })

  expect(result.current.cameraState).toBe('error')
  expect(result.current.cameraErrorMessage).toBe(i18n.t('fasilitator.camera.errStreamEnded'))
  expect(
   toasts().some(
    (t) => t.type === 'error' && t.message === i18n.t('fasilitator.camera.errStreamEnded'),
   ),
  ).toBe(true)
  // Listener removed on failure, stream released.
  expect(track.endedListeners.size).toBe(0)
  expect(result.current.streamRef.current).toBeNull()
 })
})

describe('useCamera: intentional stops are never errors', () => {
 it('stopStream() stops tracks without an error transition or toast', async () => {
  const track = new FakeTrack()
  const stream = new FakeStream([track])
  installMediaDevices(vi.fn().mockResolvedValue(stream))

  const { result } = renderHook(() => useCamera({ enabled: true }))
  await flush()
  expect(result.current.cameraState).toBe('active')

  act(() => {
   result.current.stopStream()
  })

  // stop() dispatched 'ended' synchronously (misbehaving source) — must be inert.
  expect(result.current.cameraState).toBe('active')
  expect(toasts()).toEqual([])
  expect(track.readyState).toBe('ended')
  expect(track.endedListeners.size).toBe(0)
  expect(result.current.streamRef.current).toBeNull()
 })

 it('unmount detaches listeners and stops the stream without surfacing an error', async () => {
  const track = new FakeTrack()
  const stream = new FakeStream([track])
  installMediaDevices(vi.fn().mockResolvedValue(stream))

  const { unmount } = renderHook(() => useCamera({ enabled: true }))
  await flush()
  expect(track.endedListeners.size).toBe(1)

  unmount()

  expect(track.readyState).toBe('ended')
  expect(track.endedListeners.size).toBe(0)
  expect(toasts()).toEqual([])
  // A late event on the dead track is inert (no listeners left).
  act(() => {
   track.emitEnded()
  })
  expect(toasts()).toEqual([])
 })
})

describe('useCamera: restartCamera retry path', () => {
 it('recovers after a denial, and repeated restarts never fire a stream-error toast', async () => {
  const getUserMedia = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
  installMediaDevices(getUserMedia)

  const { result } = renderHook(() => useCamera({ enabled: true }))
  await flush()
  expect(result.current.cameraState).toBe('denied')

  // Permission granted / device back on a retry click.
  const track2 = new FakeTrack()
  getUserMedia.mockResolvedValue(new FakeStream([track2]))
  act(() => {
   result.current.restartCamera()
  })
  await flush()

  expect(result.current.cameraState).toBe('active')
  expect(result.current.cameraErrorMessage).toBeNull()

  // Second retry while active: old stream released intentionally (its stop()
  // dispatches 'ended' synchronously) and NO error toast may appear.
  const toastCount = toasts().length
  const track3 = new FakeTrack()
  getUserMedia.mockResolvedValue(new FakeStream([track3]))
  act(() => {
   result.current.restartCamera()
  })
  await flush()

  expect(result.current.cameraState).toBe('active')
  expect(toasts().length).toBe(toastCount)
  expect(track2.readyState).toBe('ended')
  expect(track2.endedListeners.size).toBe(0)
  expect(track3.endedListeners.size).toBe(1)
 })
})
