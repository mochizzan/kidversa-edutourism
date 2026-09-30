import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'

// ── Mocks (registered before importing the page) ──────────────────────────
vi.mock('@/core/services/sessions', () => ({
  sessionService: {
    getParticipantById: vi.fn(),
    getById: vi.fn(),
  },
}))

vi.mock('@/core/services/frames', () => ({
  frameService: {
    getAll: vi.fn(),
  },
}))

vi.mock('@/core/services/photos', () => ({
  photoService: {
    getByParticipant: vi.fn(),
    getReportPicks: vi.fn(),
    setReportPick: vi.fn(),
    clearReportPick: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
    update: vi.fn(),
    setReportPhoto: vi.fn(),
  },
}))

vi.mock('@/features/fasilitator/hooks/useGroupOwnership', () => ({
  useGroupOwnership: vi.fn(() => ({ isMine: true })),
}))

// jsdom has no camera: hand the page a ready-made video/stream ref.
const cameraMocks = vi.hoisted(() => {
  const fakeVideo = { videoWidth: 720, videoHeight: 1280, srcObject: null }
  return {
    // React assigns the real jsdom <video> into this ref on mount (its
    // videoWidth is 0 → degenerate crop) and nulls it on unmount. The
    // accessors pin the ref to the scripted 720×1280 video so capture
    // assertions see stable dimensions and identity in every phase.
    videoRef: {
      get current() {
        return fakeVideo
      },
      set current(_element: unknown) {
        // Ignored: tests never want the real element in this ref.
      },
    },
    streamRef: { current: null },
  }
})

vi.mock('@/features/fasilitator/hooks/useCamera', () => ({
  useCamera: () => ({
    videoRef: cameraMocks.videoRef,
    streamRef: cameraMocks.streamRef,
    cameraState: 'active',
    cameraErrorMessage: null,
    devices: [],
    selectedDeviceId: '',
    facingMode: 'user',
    switchCamera: vi.fn(),
    selectDevice: vi.fn(),
    restartCamera: vi.fn(),
    stopStream: vi.fn(),
  }),
}))

// Import after mocks are registered
import SmartPhotoPage from '@/features/fasilitator/pages/SmartPhotoPage'
import { CameraViewport } from '@/features/fasilitator/components/CameraViewport'
import { sessionService } from '@/core/services/sessions'
import { frameService } from '@/core/services/frames'
import { photoService } from '@/core/services/photos'
import { useAuthStore } from '@/core/stores/authStore'
import { useToastStore } from '@/core/stores/toastStore'
import { ApiError } from '@/core/services/backend-client'
import { i18n } from '@/core/i18n'

const NETWORK_MSG = 'Gagal terhubung ke server. Periksa koneksi internet Anda.'

const participant = {
  id: 'c-1',
  session_id: 's-1',
  group_id: 'g-1',
  child_name: 'Budi',
  child_age: 7,
  school_name: 'SD Satu',
  parent_phone: '0812',
  consent_photo: true,
  created_at: '2026-09-30T01:00:00Z',
}

async function renderPage() {
  const result = render(
    <MemoryRouter initialEntries={['/fasilitator/groups/g-1/children/c-1/photo']}>
      <Routes>
        <Route path="/fasilitator/groups/:groupId/children/:childId/photo" element={<SmartPhotoPage />} />
        <Route path="/fasilitator/galeri/peserta/:childId" element={<div>HALAMAN GALERI</div>} />
      </Routes>
    </MemoryRouter>,
  )
  // Flush participant + frames + photo loads
  await act(async () => { })
  return result
}

async function captureAndOpenEditor() {
  const captureBtn = document.querySelector('button.w-14')
  if (!captureBtn) throw new Error('capture button not found')
  await act(async () => {
    fireEvent.click(captureBtn)
  })
  // Editor phase: PhotoEditor rendered with the Simpan (save) action
  await act(async () => { })
}

function errorToasts() {
  return useToastStore.getState().toasts.filter((t) => t.type === 'error')
}

describe('SmartPhotoPage: participant fetch edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToastStore.setState({ toasts: [] })
    useAuthStore.setState({
      user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' },
    } as never)
    vi.mocked(frameService.getAll).mockResolvedValue({ data: [] } as never)
    vi.mocked(photoService.getByParticipant).mockResolvedValue([] as never)
    vi.mocked(photoService.getReportPicks).mockResolvedValue([] as never)
    vi.mocked(sessionService.getParticipantById).mockResolvedValue(participant as never)
  })

  it('shows a friendly network error with retry when the participant fetch fails, then recovers', async () => {
    vi.mocked(sessionService.getParticipantById).mockRejectedValueOnce(new TypeError('fetch failed'))

    await renderPage()

    expect(screen.getByText(NETWORK_MSG)).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Coba lagi' })
    expect(sessionService.getParticipantById).toHaveBeenCalledTimes(1)

    vi.mocked(sessionService.getParticipantById).mockResolvedValue(participant as never)
    await act(async () => {
      fireEvent.click(retry)
    })

    // Recovered: second fetch attempted, camera page rendered
    expect(sessionService.getParticipantById).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(NETWORK_MSG)).toBeNull()
    expect(screen.getByText('Ambil Foto')).toBeInTheDocument()
  })

  it('shows the child-missing screen with a retry button when the participant is gone (404)', async () => {
    vi.mocked(sessionService.getParticipantById).mockResolvedValueOnce(null)

    await renderPage()

    expect(screen.getByText('Anak Tidak Ditemukan')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Coba lagi' })

    vi.mocked(sessionService.getParticipantById).mockResolvedValue(participant as never)
    await act(async () => {
      fireEvent.click(retry)
    })

    expect(screen.queryByText('Anak Tidak Ditemukan')).toBeNull()
    expect(screen.getByText('Ambil Foto')).toBeInTheDocument()
  })
})

describe('SmartPhotoPage: upload failure surfaces a toast and recovers', () => {
  beforeAll(() => {
    // jsdom has no canvas rendering — stub the 2D surface used by capture/save.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA')
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function(cb: BlobCallback) {
      cb(new Blob(['x'], { type: 'image/jpeg' }))
    } as never)
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    useToastStore.setState({ toasts: [] })
    useAuthStore.setState({
      user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' },
    } as never)
    vi.mocked(frameService.getAll).mockResolvedValue({ data: [] } as never)
    vi.mocked(photoService.getByParticipant).mockResolvedValue([] as never)
    vi.mocked(photoService.getReportPicks).mockResolvedValue([] as never)
    vi.mocked(sessionService.getParticipantById).mockResolvedValue(participant as never)
  })

  it('network failure while uploading: error toast, save button recovers, capture is not lost', async () => {
    vi.mocked(photoService.upload).mockRejectedValue(new TypeError('fetch failed'))

    await renderPage()
    await captureAndOpenEditor()

    expect(screen.getByRole('button', { name: 'Simpan' })).toBeInTheDocument()

    const saveBtn = screen.getByRole('button', { name: 'Simpan' })
    await act(async () => {
      fireEvent.click(saveBtn)
    })

    // User-visible, readable toast for the failed upload
    expect(errorToasts().some((t) => t.message === NETWORK_MSG)).toBe(true)

    // State recovery: isSaving reset (button enabled again), still in editor —
    // the capture is retained for a retry, and no navigation happened.
    expect(screen.getByRole('button', { name: 'Simpan' })).not.toBeDisabled()
    expect(screen.queryByText('HALAMAN GALERI')).toBeNull()
    expect(photoService.upload).toHaveBeenCalledTimes(1)
  })

  it('server validation failure (415 file gate) surfaces the backend message as a toast', async () => {
    vi.mocked(photoService.upload).mockRejectedValue(
      new ApiError('Tipe berkas tidak diizinkan', 'file_type_unsupported', 415),
    )

    await renderPage()
    await captureAndOpenEditor()

    const saveBtn = screen.getByRole('button', { name: 'Simpan' })
    await act(async () => {
      fireEvent.click(saveBtn)
    })

    expect(errorToasts().some((t) => t.message === 'Tipe berkas tidak diizinkan')).toBe(true)
    expect(screen.getByRole('button', { name: 'Simpan' })).not.toBeDisabled()
    expect(screen.queryByText('HALAMAN GALERI')).toBeNull()
  })
})

// ── Capture without a frame, mirror-at-capture, base-load failure ──────────
describe('SmartPhotoPage: capture edge cases', () => {
  interface CtxCall {
    canvas: HTMLCanvasElement
    method: string
    args: unknown[]
  }

  let ctxCalls: CtxCall[] = []
  let imageLoadMode: 'load' | 'error' = 'load'

  /** Deterministic microtask drain (no wall-clock waits). */
  async function flush() {
    await act(async () => {
      for (let i = 0; i < 25; i++) await Promise.resolve()
    })
  }

  function canvasesIn(container: HTMLElement) {
    const capture = container.querySelector('canvas.hidden')
    const editor = container.querySelector('canvas:not(.hidden)')
    if (!capture || !editor) throw new Error('capture/editor canvas not found')
    return { capture: capture as HTMLCanvasElement, editor: editor as HTMLCanvasElement }
  }

  const callsFor = (canvas: HTMLCanvasElement) => ctxCalls.filter((c) => c.canvas === canvas)

  beforeAll(() => {
    ctxCalls = []
    imageLoadMode = 'load'

    // Recording 2D contexts: every draw/transform is attributed to the canvas
    // it ran on, so capture-time and compose-time calls stay separable.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function(this: HTMLCanvasElement) {
      const record = (method: string, ...args: unknown[]) => {
        ctxCalls.push({ canvas: this, method, args })
      }
      return {
        canvas: this,
        drawImage: (...args: unknown[]) => record('drawImage', ...args),
        save: () => record('save'),
        translate: (x: number, y: number) => record('translate', x, y),
        scale: (x: number, y: number) => record('scale', x, y),
        restore: () => record('restore'),
      } as never
    } as never)

    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,CAPTURED')
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function(cb: BlobCallback) {
      cb(new Blob(['x'], { type: 'image/jpeg' }))
    } as never)

    // jsdom never loads images. Intercept image creation so the page's
    // loadImage() resolves (or fails) deterministically — this is what lets
    // the compose effect actually run headlessly.
    const originalCreateElement = Document.prototype.createElement.bind(document) as (
      tagName: string,
      options?: string | ElementCreationOptions,
    ) => HTMLElement
    vi.spyOn(Document.prototype, 'createElement').mockImplementation(((tagName: string, options?: string | ElementCreationOptions) => {
      const el = originalCreateElement(tagName, options)
      if (tagName === 'img') {
        let src = ''
        Object.defineProperty(el, 'src', {
          configurable: true,
          get: () => src,
          set: (value: string) => {
            src = value
            queueMicrotask(() => {
              if (imageLoadMode === 'load') el.onload?.(new Event('load'))
              else el.onerror?.(new Event('error'))
            })
          },
        })
        // Intrinsic size for the stubbed capture so compose sizes 9:16.
        Object.defineProperties(el, {
          width: { configurable: true, get: () => 720 },
          height: { configurable: true, get: () => 1280 },
        })
      }
      return el
    }) as unknown as typeof Document.prototype.createElement)
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    ctxCalls = []
    imageLoadMode = 'load'
    useToastStore.setState({ toasts: [] })
    useAuthStore.setState({
      user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' },
    } as never)
    vi.mocked(frameService.getAll).mockResolvedValue({ data: [] } as never)
    vi.mocked(photoService.getByParticipant).mockResolvedValue([] as never)
    vi.mocked(photoService.getReportPicks).mockResolvedValue([] as never)
    // clearAllMocks() does NOT drop a previous suite's mockRejectedValue —
    // reset the implementation so earlier failure tests can't leak toasts here.
    vi.mocked(photoService.upload).mockReset()
    vi.mocked(sessionService.getParticipantById).mockResolvedValue(participant as never)
  })

  it('no frame selected: crop captured, base composed, save omits frame metadata, zero toasts', async () => {
    const { container } = await renderPage()
    await captureAndOpenEditor()
    await flush()

    const { capture, editor } = canvasesIn(container)
    // Capture: exactly one plain draw of the 9:16 crop (mirror off by default).
    expect(callsFor(capture)).toEqual([
      {
        canvas: capture,
        method: 'drawImage',
        args: [cameraMocks.videoRef.current, 0, 0, 720, 1280, 0, 0, 720, 1280],
      },
    ])
    // Compose: frame-free base only, full rect, no frame load attempted.
    expect(callsFor(editor)).toEqual([
      { canvas: editor, method: 'drawImage', args: [expect.any(HTMLImageElement), 0, 0, 720, 1280] },
    ])

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    })

    expect(photoService.upload).toHaveBeenCalledTimes(1)
    // frame_id omitted → no metadata update at all; nothing to complain about.
    expect(photoService.update).not.toHaveBeenCalled()
    expect(photoService.setReportPhoto).not.toHaveBeenCalled()
    expect(useToastStore.getState().toasts).toEqual([])
    expect(screen.getByText('HALAMAN GALERI')).toBeInTheDocument()
  })

  it('capture with mirror on uses the flip transform; editor compose/save use only the frozen base', async () => {
    const { container } = await renderPage()

    // Mirror ON via the unified top-right menu (camera phase only).
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Otomatis' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cermin' }))
    })

    await captureAndOpenEditor()
    await flush()

    const { capture, editor } = canvasesIn(container)
    const captureCalls = callsFor(capture)
    expect(captureCalls.map((c) => c.method)).toEqual(['save', 'translate', 'scale', 'drawImage', 'restore'])
    expect(captureCalls[1].args).toEqual([720, 0])
    expect(captureCalls[2].args).toEqual([-1, 1])
    // Crop geometry identical to the unmirrored path — only the transform differs.
    expect(captureCalls[3].args).toEqual([cameraMocks.videoRef.current, 0, 0, 720, 1280, 0, 0, 720, 1280])
    // Snapshot taken after the flip.
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9)

    // The mirror menu lives only in the camera phase: unmounted in the editor,
    // so nothing can toggle it mid-edit.
    expect(screen.queryByRole('button', { name: 'Cermin' })).toBeNull()

    // Compose: ONE base draw at the full rect — no mirror transform re-applied.
    expect(callsFor(editor)).toEqual([
      { canvas: editor, method: 'drawImage', args: [expect.any(HTMLImageElement), 0, 0, 720, 1280] },
    ])

    // Save of the mirrored capture proceeds frame-free with zero toasts.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    })
    expect(photoService.upload).toHaveBeenCalledTimes(1)
    expect(photoService.update).not.toHaveBeenCalled()
    expect(useToastStore.getState().toasts).toEqual([])
    expect(screen.getByText('HALAMAN GALERI')).toBeInTheDocument()
  })

  it('toggling mirror off after a capture only affects the next capture (captured base is frozen)', async () => {
    const { container } = await renderPage()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Otomatis' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cermin' }))
    })

    ctxCalls = []
    await captureAndOpenEditor()
    const { capture } = canvasesIn(container)
    expect(callsFor(capture).map((c) => c.method)).toEqual(['save', 'translate', 'scale', 'drawImage', 'restore'])

    // Retake back to camera (mirror state persists), then toggle mirror OFF.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ulang' }))
    })
    expect(screen.getByRole('button', { name: 'Otomatis' })).toBeInTheDocument()
    ctxCalls = []
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Otomatis' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cermin' }))
    })

    await captureAndOpenEditor()
    // The NEXT capture reflects the new state; the first capture's flip was
    // baked into its own snapshot and never recomputed from mirror state.
    expect(callsFor(capture).map((c) => c.method)).toEqual(['drawImage'])
  })

  it('base image load failure logs console.error and shows a toast (no silent editor)', async () => {
    imageLoadMode = 'error'
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
    try {
      await renderPage()
      await captureAndOpenEditor()
      await flush()

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[SmartPhotoPage] failed to compose the captured photo',
        expect.anything(),
      )
      expect(
        useToastStore.getState().toasts.some(
          (t) => t.message === i18n.t('fasilitator.photos.composeError'),
        ),
      ).toBe(true)
    } finally {
      consoleErrorSpy.mockRestore()
      imageLoadMode = 'load'
    }
  })
})

// ── Camera failure overlay (category 1) ────────────────────────────────────
describe('CameraViewport: denied/error overlay', () => {
  const viewportProps = {
    showGrid: false,
    pageError: null,
    onRetryLoad: vi.fn(),
    devices: [],
    selectedDeviceId: '',
    currentCameraLabel: 'Otomatis',
    cameraPickerOpen: false,
    onToggleCameraPicker: vi.fn(),
    onCloseCameraPicker: vi.fn(),
    onDeviceChange: vi.fn(),
    onSwitchCamera: vi.fn(),
    onToggleGrid: vi.fn(),
    mirror: false,
    onToggleMirror: vi.fn(),
    photoCount: 0,
    maxPhotos: 10,
    isMaxPhotos: false,
    onTakePhoto: vi.fn(),
    onOpenGallery: vi.fn(),
    onOpenFramePicker: vi.fn(),
    disabled: false,
    participant: { ...participant, parent_name: 'Wali' },
  }

  it('denied: persistent message plus a retry action wired to onRetryCamera', () => {
    const onRetryCamera = vi.fn()
    render(
      <CameraViewport
        videoRef={{ current: null }}
        cameraState="denied"
        cameraErrorMessage={i18n.t('fasilitator.camera.errDenied')}
        onRetryCamera={onRetryCamera}
        {...viewportProps}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('fasilitator.camera.errDenied'))
    const retry = screen.getByRole('button', { name: 'Coba lagi' })
    fireEvent.click(retry)
    expect(onRetryCamera).toHaveBeenCalledTimes(1)
  })

  it('error without a recorded reason falls back to the generic camera message', () => {
    render(
      <CameraViewport
        videoRef={{ current: null }}
        cameraState="error"
        cameraErrorMessage={null}
        onRetryCamera={vi.fn()}
        {...viewportProps}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('fasilitator.camera.errGeneric'))
  })
})
