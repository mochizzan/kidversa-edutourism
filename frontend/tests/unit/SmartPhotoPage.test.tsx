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
const cameraMocks = vi.hoisted(() => ({
  videoRef: { current: { videoWidth: 720, videoHeight: 1280, srcObject: null } },
  streamRef: { current: null },
}))

vi.mock('@/features/fasilitator/hooks/useCamera', () => ({
  useCamera: () => ({
    videoRef: cameraMocks.videoRef,
    streamRef: cameraMocks.streamRef,
    cameraState: 'active',
    devices: [],
    selectedDeviceId: '',
    facingMode: 'user',
    switchCamera: vi.fn(),
    selectDevice: vi.fn(),
    restartCamera: vi.fn(),
  }),
}))

// Import after mocks are registered
import SmartPhotoPage from '@/features/fasilitator/pages/SmartPhotoPage'
import { sessionService } from '@/core/services/sessions'
import { frameService } from '@/core/services/frames'
import { photoService } from '@/core/services/photos'
import { useAuthStore } from '@/core/stores/authStore'
import { useToastStore } from '@/core/stores/toastStore'
import { ApiError } from '@/core/services/backend-client'

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
