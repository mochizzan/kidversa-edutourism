import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'

// ── Mocks (registered before importing the page) ──────────────────────────
vi.mock('@/core/services/sessions', () => ({
  sessionService: {
    getParticipantById: vi.fn(),
    getById: vi.fn(),
    getStages: vi.fn(),
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
import type { SmartPhoto } from '@/core/types'

const NETWORK_MSG = 'Gagal terhubung ke server. Periksa koneksi internet Anda.'

// Perbaikan-2: session stages drive the camera's topic resolution — upload
// (session_stage_id) + the "Ambil Foto — <topik>" label. Default: ONE topic;
// set once at module scope so vi.clearAllMocks() (calls only, keeps the
// implementation) leaves it in place for every suite in this file.
vi.mocked(sessionService.getStages).mockResolvedValue([
  { id: 'ss1', session_id: 's-1', program_stage_id: 'ps1', status: 'IN_PROGRESS' },
] as never)

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

// Two-entry history so a back-navigation (Batal → navigate(-1)) has a
// visible destination to assert on.
async function renderPageWithBackStack() {
  const result = render(
    <MemoryRouter
      initialEntries={[
        '/fasilitator/groups/g-1',
        '/fasilitator/groups/g-1/children/c-1/photo',
      ]}
    >
      <Routes>
        <Route path="/fasilitator/groups/:groupId" element={<div>HALAMAN KELOMPOK</div>} />
        <Route
          path="/fasilitator/groups/:groupId/children/:childId/photo"
          element={<SmartPhotoPage />}
        />
        <Route path="/fasilitator/galeri/peserta/:childId" element={<div>HALAMAN GALERI</div>} />
      </Routes>
    </MemoryRouter>,
  )
  await act(async () => { })
  return result
}

function errorToasts() {
  return useToastStore.getState().toasts.filter((t) => t.type === 'error')
}

/** Open the settings gear, flip one of its toggles, then close via Escape. */
async function toggleViaGear(name: 'Grid' | 'Cermin') {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Pengaturan' }))
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('switch', { name }))
  })
  await act(async () => {
    fireEvent.keyDown(document, { key: 'Escape' })
  })
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
    // Perbaikan-2: the header carries the active topic (topicFallback name
    // here — the mocked useGroupOwnership exposes no program data).
    expect(screen.getByText('Ambil Foto — Topik')).toBeInTheDocument()
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
    expect(screen.getByText('Ambil Foto — Topik')).toBeInTheDocument()
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

  it('upload rejected mid-flight: uploading toast removed, error toast kept, no navigation, editor preserved', async () => {
    let rejectUpload!: (err: unknown) => void
    vi.mocked(photoService.upload).mockImplementation(
      () =>
        new Promise<SmartPhoto>((_resolve, reject) => {
          rejectUpload = reject
        }),
    )

    await renderPage()
    await captureAndOpenEditor()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    })

    // While in flight: the persistent uploading toast is shown, save is locked.
    const during = useToastStore.getState().toasts
    expect(during.filter((t) => t.message === i18n.t('fasilitator.photos.uploading'))).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Simpan' })).toBeDisabled()
    expect(screen.queryByText('HALAMAN GALERI')).toBeNull()

    await act(async () => {
      rejectUpload(new TypeError('fetch failed'))
    })

    // After the rejection: uploading toast gone (removed in finally), the
    // friendly error toast remains, and the editor is intact for a retry.
    const after = useToastStore.getState().toasts
    expect(after.some((t) => t.message === i18n.t('fasilitator.photos.uploading'))).toBe(false)
    expect(after.some((t) => t.type === 'error' && t.message === NETWORK_MSG)).toBe(true)
    expect(screen.getByRole('button', { name: 'Simpan' })).not.toBeDisabled()
    expect(screen.queryByText('HALAMAN GALERI')).toBeNull()
  })
})

// ── Consent lock: stale flag, mid-flight 403, refetch re-evaluation ────────
describe('SmartPhotoPage: consent lock and mid-flight consent_required', () => {
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

  it('locks the capture page when consent is missing and unlocks after a refetch grants it', async () => {
    vi.mocked(sessionService.getParticipantById).mockResolvedValue({
      ...participant,
      consent_photo: false,
    } as never)

    await renderPage()

    // Lock screen — NOT the camera: Indonesian copy from the photos namespace.
    expect(screen.getByText('Akses Foto Diblokir')).toBeInTheDocument()
    expect(
      screen.getByText('Izin foto untuk anak ini belum diberikan oleh orang tua.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pengaturan' })).toBeNull()

    // Re-evaluation on refetch: the participant now reports consent granted.
    vi.mocked(sessionService.getParticipantById).mockResolvedValue(participant as never)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }))
    })

    expect(screen.queryByText('Akses Foto Diblokir')).toBeNull()
    expect(screen.getByText('Ambil Foto — Topik')).toBeInTheDocument()
  })

  it('mid-flight 403 consent_required: consent toast, participant refetch, lock replaces the capture', async () => {
    // First load is STALE (consent still true); the refetch after the 403
    // reports the revoked/migrated state — same shape as the migration bug.
    vi.mocked(sessionService.getParticipantById)
      .mockResolvedValueOnce(participant as never)
      .mockResolvedValue({ ...participant, consent_photo: false } as never)
    vi.mocked(photoService.upload).mockRejectedValue(
      new ApiError('Persetujuan orang tua diperlukan', 'consent_required', 403),
    )

    await renderPage()
    await captureAndOpenEditor()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    })

    // Clear user-facing outcome for the mid-flight 403 — never a dead end…
    expect(
      errorToasts().some((t) => t.message === i18n.t('fasilitator.photos.consentRequired')),
    ).toBe(true)
    // …and the stale flag flips: the refetched participant re-evaluates the
    // lock screen, so the capture UI stops being offered.
    expect(await screen.findByText('Akses Foto Diblokir')).toBeInTheDocument()
    expect(sessionService.getParticipantById).toHaveBeenCalledTimes(2)
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

  it('no frame selected: crop captured, base composed, save omits frame metadata, success toast without navigation', async () => {
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
    // Spec: success surfaces exactly ONE success toast — the persistent
    // uploading toast was removed in finally (only the server's response
    // decides the final status).
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({
      type: 'success',
      message: i18n.t('fasilitator.photos.uploadSuccess'),
    })
    // Spec: Simpan NEVER navigates — the editor resets to the camera phase.
    expect(screen.queryByText('HALAMAN GALERI')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Simpan' })).toBeNull()
    expect(container.querySelector('button.w-14')).not.toBeNull()
  })

  it('capture with mirror on uses the flip transform; editor compose/save use only the frozen base', async () => {
    const { container } = await renderPage()

    // Mirror ON via the settings gear panel (camera phase only).
    await toggleViaGear('Cermin')
    expect(document.querySelector('video')?.style.transform).toBe('scaleX(-1)')

    await captureAndOpenEditor()
    await flush()

    const { capture, editor } = canvasesIn(container)
    const captureCalls = callsFor(capture)
    expect(captureCalls.map((c) => c.method)).toEqual(['save', 'translate', 'scale', 'drawImage', 'restore'])
    expect(captureCalls[1].args).toEqual([720, 0])
    expect(captureCalls[2].args).toEqual([-1, 1])
    // Crop geometry identical to the unmirrored path — only the transform differs.
    expect(captureCalls[3].args).toEqual([cameraMocks.videoRef.current, 0, 0, 720, 1280, 0, 0, 720, 1280])
    // Snapshot taken after the flip — lossless PNG (no quality arg).
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/png')

    // The gear panel lives only in the camera phase: unmounted in the editor,
    // so nothing can toggle it mid-edit.
    expect(screen.queryByRole('switch', { name: 'Cermin' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pengaturan' })).toBeNull()

    // Compose: ONE base draw at the full rect — no mirror transform re-applied.
    expect(callsFor(editor)).toEqual([
      { canvas: editor, method: 'drawImage', args: [expect.any(HTMLImageElement), 0, 0, 720, 1280] },
    ])

    // Save of the mirrored capture proceeds frame-free: one success toast
    // (uploading toast removed in finally), no navigation, camera phase back.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    })
    expect(photoService.upload).toHaveBeenCalledTimes(1)
    expect(photoService.update).not.toHaveBeenCalled()
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({
      type: 'success',
      message: i18n.t('fasilitator.photos.uploadSuccess'),
    })
    expect(screen.queryByText('HALAMAN GALERI')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Simpan' })).toBeNull()
    expect(container.querySelector('button.w-14')).not.toBeNull()
  })

  it('toggling mirror off after a capture only affects the next capture (captured base is frozen)', async () => {
    const { container } = await renderPage()

    await toggleViaGear('Cermin')

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
    await toggleViaGear('Cermin')

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

  it('selected frame without an image: warns, shows the fallback toast, and saves frame-free', async () => {
    // Global active frame whose image URL is missing — selectable in the
    // picker, but there is nothing to compose.
    vi.mocked(frameService.getAll).mockResolvedValue({
      data: [
        {
          id: 'f-broken',
          tenant_id: 't1',
          program_id: '',
          name: 'Rusak',
          file_url: '',
          is_active: true,
          sort_order: 0,
          created_at: '2026-09-30T01:00:00Z',
        },
      ],
    } as never)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })
    try {
      const { container } = await renderPage()
      await captureAndOpenEditor()
      await flush()

      const { editor } = canvasesIn(container)
      const drawsBeforeSelect = callsFor(editor).filter((c) => c.method === 'drawImage').length

      // Pick the broken frame from the picker modal.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Pilih Frame' }))
      })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Rusak' }))
      })
      await flush()

      // Never a silent path: the fallback is logged AND surfaced to the user.
      expect(warnSpy).toHaveBeenCalledWith(
        '[SmartPhotoPage] selected frame has no image; saving frame-free',
        'f-broken',
      )
      expect(
        useToastStore.getState().toasts.some(
          (t) =>
            t.type === 'warning' &&
            t.message === i18n.t('fasilitator.photos.frameFallbackToast'),
        ),
      ).toBe(true)

      // The re-compose drew exactly one rect (the frame-free base) — the
      // invalid frame was never layered onto the canvas.
      const drawsAfterSelect = callsFor(editor).filter((c) => c.method === 'drawImage').length
      expect(drawsAfterSelect - drawsBeforeSelect).toBe(1)

      // Saving reports no frame metadata: composedFrameIdRef stayed null.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
      })
      expect(photoService.upload).toHaveBeenCalledTimes(1)
      expect(photoService.update).not.toHaveBeenCalled()
      expect(photoService.setReportPhoto).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('rapor toggle is absent without a captured photo (editor "processing" state)', async () => {
    await renderPage()
    // Camera phase — nothing captured: no editor controls at all.
    expect(screen.queryByRole('button', { name: 'Jadikan Foto Raport' })).toBeNull()

    // Degenerate capture (empty snapshot): the page enters the editor's
    // processing state — phase editor, but no captured data yet.
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValueOnce('')
    await captureAndOpenEditor()
    await act(async () => { })

    expect(screen.getByText('Memproses gambar...')).toBeInTheDocument()
    // PhotoEditor (and its rapor toggle / save control) only mounts with data.
    expect(screen.queryByRole('button', { name: 'Jadikan Foto Raport' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Simpan' })).toBeNull()
  })

  it('post-capture controls sit outside the canvas box; Batal is a card-less centered capsule footer', async () => {
    const { container } = await renderPage()
    await captureAndOpenEditor()
    await flush()

    const captureCanvas = container.querySelector('canvas.hidden')
    expect(captureCanvas).not.toBeNull()
    const canvasBox = captureCanvas!.parentElement as HTMLElement
    expect(canvasBox.className).toContain('aspect-[9/16]')
    expect(canvasBox.className).toContain('overflow-hidden')
    const wrapper = canvasBox.parentElement as HTMLElement
    expect(wrapper.classList.contains('pr-16')).toBe(true)

    // Icon column: absolute right column anchored to the wrapper — NOT a
    // descendant of the clipped canvas box (it lives in the pr-16 gutter).
    const column = Array.from(wrapper.querySelectorAll('div')).find(
      (el) =>
        el.classList.contains('absolute') &&
        el.classList.contains('flex-col') &&
        Array.from(el.classList).some((cls) => cls.startsWith('right-')),
    )
    expect(column).toBeTruthy()
    expect(column!.parentElement).toBe(wrapper)
    expect(canvasBox.contains(column!)).toBe(false)

    // Batal: standalone capsule in a centered footer below the canvas, with
    // no card/panel wrapper anywhere in its ancestor chain.
    const batal = screen.getByRole('button', { name: 'Batal' })
    expect(batal.classList.contains('rounded-full')).toBe(true)
    expect(canvasBox.contains(batal)).toBe(false)
    const footer = batal.parentElement as HTMLElement
    expect(footer.classList.contains('flex-col')).toBe(true)
    expect(footer.classList.contains('items-center')).toBe(true)
    expect(footer.classList.contains('rounded-2xl')).toBe(false)
    expect(batal.closest('.rounded-2xl')).toBeNull()
    // The footer renders after the canvas box (below it), both in the wrapper.
    expect(footer.parentElement).toBe(wrapper)
    expect(
      canvasBox.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

// ── Page guards while an upload is in flight ──────────────────────────────
describe('SmartPhotoPage: page guards during an in-flight upload', () => {
  beforeAll(() => {
    // jsdom has no canvas: stub the 2D surface used by capture/save.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA')
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function(cb: BlobCallback) {
      cb(new Blob(['x'], { type: 'image/png' }))
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
    // Drop any pending-upload mock from a previous test.
    vi.mocked(photoService.upload).mockReset()
    vi.mocked(sessionService.getParticipantById).mockResolvedValue(participant as never)
  })

  /** Capture + click Simpan with the upload left pending (in-flight state). */
  async function startInFlightUpload(page: () => Promise<unknown> = renderPage) {
    await page()
    await captureAndOpenEditor()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    })
    expect(screen.getByRole('button', { name: 'Simpan' })).toBeDisabled()
  }

  it('blocks beforeunload only while saving; the listener is removed once the save settles', async () => {
    let resolveUpload!: (photo: SmartPhoto) => void
    vi.mocked(photoService.upload).mockImplementation(
      () =>
        new Promise<SmartPhoto>((resolve) => {
          resolveUpload = resolve
        }),
    )

    await startInFlightUpload()

    const duringSaving = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(duringSaving)
    expect(duringSaving.defaultPrevented).toBe(true)

    // Save settles (success) → isSaving false → guard removed.
    await act(async () => {
      resolveUpload({
        id: 'ph-9',
        participant_id: 'c-1',
        session_id: 's-1',
        original_file_url: '',
        is_report_photo: false,
        taken_by: 'u1',
        taken_at: '2026-09-30T02:00:00Z',
      })
    })
    expect(screen.queryByRole('button', { name: 'Simpan' })).toBeNull()

    const afterSaving = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(afterSaving)
    expect(afterSaving.defaultPrevented).toBe(false)
  })

  it('Batal during an in-flight upload, confirm declined: no navigation, upload guard stays', async () => {
    vi.mocked(photoService.upload).mockImplementation(
      () => new Promise<SmartPhoto>(() => { }),
    )
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    try {
      await startInFlightUpload(renderPageWithBackStack)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Batal' }))
      })

      expect(confirmSpy).toHaveBeenCalledWith(i18n.t('fasilitator.photos.leaveUploadConfirm'))
      expect(screen.queryByText('HALAMAN KELOMPOK')).toBeNull()
      expect(screen.queryByText('HALAMAN GALERI')).toBeNull()
      // Still in the editor with the save locked — the upload was not abandoned.
      expect(screen.getByRole('button', { name: 'Simpan' })).toBeDisabled()
    } finally {
      confirmSpy.mockRestore()
    }
  })

  it('Batal during an in-flight upload, confirm accepted: navigates back off the capture page', async () => {
    vi.mocked(photoService.upload).mockImplementation(
      () => new Promise<SmartPhoto>(() => { }),
    )
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    try {
      await startInFlightUpload(renderPageWithBackStack)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Batal' }))
      })

      expect(confirmSpy).toHaveBeenCalledWith(i18n.t('fasilitator.photos.leaveUploadConfirm'))
      expect(screen.getByText('HALAMAN KELOMPOK')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Simpan' })).toBeNull()
    } finally {
      confirmSpy.mockRestore()
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
    mirror: false,
    photoCount: 0,
    maxPhotos: 10,
    isMaxPhotos: false,
    takePhotoLabel: 'Ambil Foto',
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

// ── Settings gear: grid/mirror toggles live outside the canvas ────────────
describe('SmartPhotoPage: settings gear panel', () => {
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

  it('gear opens a panel whose switches reflect state and drive the grid overlay and mirrored preview', async () => {
    const { container } = await renderPage()

    // Panel starts closed; the gear advertises the dialog and is enabled.
    const gear = screen.getByRole('button', { name: 'Pengaturan' })
    expect(gear).toHaveAttribute('aria-haspopup', 'dialog')
    expect(gear).toHaveAttribute('aria-expanded', 'false')
    expect(gear).toHaveAttribute('aria-disabled', 'false')
    expect(screen.queryByRole('dialog', { name: 'Pengaturan' })).toBeNull()

    await act(async () => {
      fireEvent.click(gear)
    })
    expect(gear.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('switch', { name: 'Grid' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Cermin' })).toHaveAttribute('aria-checked', 'false')

    // Grid on → thirds overlay appears over the preview.
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Grid' }))
    })
    expect(screen.getByRole('switch', { name: 'Grid' })).toHaveAttribute('aria-checked', 'true')
    expect(container.querySelector('[data-testid="grid-overlay"]')).not.toBeNull()

    // Mirror on → preview flips.
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Cermin' }))
    })
    expect(document.querySelector('video')?.style.transform).toBe('scaleX(-1)')

    // Outside click closes the panel; the toggles keep their state.
    await act(async () => {
      fireEvent.click(document.querySelector('div.fixed.inset-0')!)
    })
    expect(screen.queryByRole('dialog', { name: 'Pengaturan' })).toBeNull()

    // Reopen: state reflected; Escape closes.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pengaturan' }))
    })
    expect(screen.getByRole('switch', { name: 'Grid' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'Cermin' })).toHaveAttribute('aria-checked', 'true')
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(screen.queryByRole('dialog', { name: 'Pengaturan' })).toBeNull()

    // Grid off → overlay gone again.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pengaturan' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Grid' }))
    })
    expect(container.querySelector('[data-testid="grid-overlay"]')).toBeNull()
    expect(screen.getByRole('switch', { name: 'Grid' })).toHaveAttribute('aria-checked', 'false')
  })
})

// ── FLIP feature deleted entirely (button, prop chain, handler, i18n) ─────
describe('flip feature removed', () => {
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

  it('renders no flip control anywhere, and the camera dropdown holds only the device list', async () => {
    await renderPage()

    expect(screen.queryByRole('button', { name: 'Balik' })).toBeNull()

    // Open the camera selector: device list only — no flip/grid/mirror rows.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Otomatis' }))
    })
    expect(screen.queryByRole('button', { name: 'Balik' })).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Grid' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cermin' })).toBeNull()
    // Trigger + automatic-device option inside the open dropdown.
    expect(screen.getAllByRole('button', { name: 'Otomatis' })).toHaveLength(2)
  })

  it('no flip references remain in the camera sources or any locale catalog', () => {
    const sources = [
      'src/features/fasilitator/components/CameraViewport.tsx',
      'src/features/fasilitator/components/CameraSettings.tsx',
      'src/features/fasilitator/pages/SmartPhotoPage.tsx',
      'src/features/fasilitator/hooks/useCamera.ts',
    ]
    for (const rel of sources) {
      const src = readFileSync(resolve(process.cwd(), rel), 'utf8')
      expect(src, rel).not.toMatch(/switchCamera|onSwitchCamera|RefreshCw|camera\.flip/)
    }

    const langs = ['id', 'en', 'ja', 'ko', 'ms', 'th', 'tl', 'vi', 'zh']
    for (const lang of langs) {
      const catalog = JSON.parse(
        readFileSync(resolve(process.cwd(), `src/locales/${lang}.json`), 'utf8'),
      ) as { fasilitator: { camera: Record<string, string> } }
      expect(catalog.fasilitator.camera.flip, lang).toBeUndefined()
      // Replacement keys landed in every catalog too (parity).
      expect(catalog.fasilitator.camera.settings, lang).toBeTruthy()
      expect(catalog.fasilitator.camera.settingsDisabled, lang).toBeTruthy()
    }
  })
})
