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
    getStages: vi.fn(),
  },
}))

vi.mock('@/core/services/programs', () => ({
  programService: {
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
  useGroupOwnership: vi.fn(),
}))

// jsdom has no camera: hand the page a ready-made video ref (same idiom as
// SmartPhotoPage.test — the ref is pinned to a scripted 720×1280 video).
const cameraMocks = vi.hoisted(() => {
  const fakeVideo = { videoWidth: 720, videoHeight: 1280, srcObject: null }
  return {
    videoRef: {
      get current() {
        return fakeVideo
      },
      set current(_element: unknown) {
        // Tests never want the real jsdom element in this ref.
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
import { sessionService } from '@/core/services/sessions'
import { programService } from '@/core/services/programs'
import { frameService } from '@/core/services/frames'
import { photoService } from '@/core/services/photos'
import { useGroupOwnership } from '@/features/fasilitator/hooks/useGroupOwnership'
import { useAuthStore } from '@/core/stores/authStore'
import { useToastStore } from '@/core/stores/toastStore'

// i18n forced to 'id' — the label under test is the source-locale string.
const LABEL_TOPIC_1 = 'Ambil Foto — Topik Satu'
const LABEL_TOPIC_2 = 'Ambil Foto — Topik Dua'

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

function makePhotos(count: number, sessionStageId: string) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${sessionStageId}-ph-${i + 1}`,
    participant_id: 'c-1',
    session_id: 's-1',
    session_stage_id: sessionStageId,
    original_file_url: '',
    is_report_photo: false,
    taken_by: 'u1',
    taken_at: `2026-09-30T02:${String(i).padStart(2, '0')}:00:00Z`,
    created_at: `2026-09-30T02:${String(i).padStart(2, '0')}:00:00Z`,
  }))
}

async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el)
  })
}

async function renderCamera(initialEntry: string) {
  const result = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/fasilitator/groups/:groupId/children/:childId/photo"
          element={<SmartPhotoPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
  // Flush participant → ownership → stages → topic name → per-topic photos.
  await act(async () => { })
  return result
}

async function captureAndOpenEditor() {
  const captureBtn = document.querySelector('button.w-14')
  if (!captureBtn) throw new Error('capture button not found')
  await act(async () => {
    fireEvent.click(captureBtn)
  })
  await act(async () => { })
}

/** Two session stages: ss1 → ps1 "Topik Satu", ss2 → ps2 "Topik Dua". */
function mockStagesAndNames() {
  vi.mocked(sessionService.getStages).mockResolvedValue([
    { id: 'ss1', session_id: 's-1', program_stage_id: 'ps1', status: 'IN_PROGRESS' },
    { id: 'ss2', session_id: 's-1', program_stage_id: 'ps2', status: 'UPCOMING' },
  ] as never)
  vi.mocked(programService.getStages).mockResolvedValue([
    { id: 'ps1', program_id: 'p1', sequence_order: 1, name: 'Topik Satu', content_type: 'TEXT' },
    { id: 'ps2', program_id: 'p1', sequence_order: 2, name: 'Topik Dua', content_type: 'TEXT' },
  ] as never)
}

function resetState() {
  vi.clearAllMocks()
  useToastStore.setState({ toasts: [] })
  useAuthStore.setState({
    user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' },
  } as never)
  vi.mocked(frameService.getAll).mockResolvedValue({ data: [] } as never)
  vi.mocked(photoService.getReportPicks).mockResolvedValue([] as never)
  vi.mocked(photoService.upload).mockResolvedValue({
    id: 'ph-new',
    participant_id: 'c-1',
    session_id: 's-1',
    original_file_url: '',
    is_report_photo: false,
    taken_by: 'u1',
    taken_at: '2026-09-30T03:00:00Z',
  } as never)
  vi.mocked(sessionService.getParticipantById).mockResolvedValue(participant as never)
  // Ownership resolves synchronously: group's CURRENT topic is ss2 — so a
  // `?stage=ss1` URL proves the query param WINS over the group default.
  vi.mocked(useGroupOwnership).mockReturnValue({
    isMine: true,
    loading: false,
    group: { id: 'g-1', current_session_stage_id: 'ss2' },
    session: { id: 's-1', program_id: 'p1' },
  } as never)
  mockStagesAndNames()
}

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

beforeEach(resetState)

describe('SmartPhotoPage: active topic from ?stage= (Perbaikan-2)', () => {
  it('loads THAT topic bucket, labels header+shutter with its name, and uploads session_stage_id from the URL', async () => {
    vi.mocked(photoService.getByParticipant).mockResolvedValue(makePhotos(3, 'ss1') as never)

    await renderCamera('/fasilitator/groups/g-1/children/c-1/photo?stage=ss1')

    // Per-topic count fetch — ?stage= beats the group's current ss2.
    expect(photoService.getByParticipant).toHaveBeenCalledWith('c-1', {
      sessionStageId: 'ss1',
    })
    // Header carries the topic name; the shutter's accessible name matches.
    expect(screen.getByText(LABEL_TOPIC_1)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: LABEL_TOPIC_1 })).toBeInTheDocument()
    // Topic-scoped counter: 3 of this topic's photos out of the per-topic cap.
    expect(screen.getByText('3/10')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: LABEL_TOPIC_1 })).not.toBeDisabled()

    await captureAndOpenEditor()
    await click(screen.getByRole('button', { name: 'Simpan' }))

    expect(photoService.upload).toHaveBeenCalledTimes(1)
    const [participantId, sessionId, sessionStageId, file] =
      vi.mocked(photoService.upload).mock.calls[0]
    expect(participantId).toBe('c-1')
    expect(sessionId).toBe('s-1')
    expect(sessionStageId).toBe('ss1')
    expect(file).toBeInstanceOf(File)
  })

  it('falls back to the group CURRENT session stage when ?stage= is absent', async () => {
    vi.mocked(photoService.getByParticipant).mockResolvedValue(makePhotos(1, 'ss2') as never)

    await renderCamera('/fasilitator/groups/g-1/children/c-1/photo')

    expect(photoService.getByParticipant).toHaveBeenCalledWith('c-1', {
      sessionStageId: 'ss2',
    })
    expect(screen.getByText(LABEL_TOPIC_2)).toBeInTheDocument()

    await captureAndOpenEditor()
    await click(screen.getByRole('button', { name: 'Simpan' }))

    expect(vi.mocked(photoService.upload).mock.calls[0][2]).toBe('ss2')
  })

  it('falls back to the FIRST session stage when neither ?stage= nor a current stage exists', async () => {
    vi.mocked(photoService.getByParticipant).mockResolvedValue(makePhotos(1, 'ss1') as never)
    vi.mocked(useGroupOwnership).mockReturnValue({
      isMine: true,
      loading: false,
      group: { id: 'g-1' },
      session: { id: 's-1', program_id: 'p1' },
    } as never)

    await renderCamera('/fasilitator/groups/g-1/children/c-1/photo')

    expect(photoService.getByParticipant).toHaveBeenCalledWith('c-1', {
      sessionStageId: 'ss1',
    })
    expect(screen.getByText(LABEL_TOPIC_1)).toBeInTheDocument()

    await captureAndOpenEditor()
    await click(screen.getByRole('button', { name: 'Simpan' }))

    expect(vi.mocked(photoService.upload).mock.calls[0][2]).toBe('ss1')
  })
})

describe('SmartPhotoPage: per-topic count and shutter gate (Perbaikan-2)', () => {
  it('shows the TOPIC count and blocks the shutter at exactly 10 photos of that topic', async () => {
    vi.mocked(photoService.getByParticipant).mockResolvedValue(makePhotos(10, 'ss1') as never)

    await renderCamera('/fasilitator/groups/g-1/children/c-1/photo?stage=ss1')

    expect(screen.getByText('10/10')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: LABEL_TOPIC_1 })).toBeDisabled()

    // Nothing was captured — the gate is purely the per-topic count.
    expect(photoService.upload).not.toHaveBeenCalled()
  })

  it('a topic with 0 photos keeps the shutter open at 0/10', async () => {
    vi.mocked(photoService.getByParticipant).mockResolvedValue([] as never)

    await renderCamera('/fasilitator/groups/g-1/children/c-1/photo?stage=ss1')

    expect(screen.getByText('0/10')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: LABEL_TOPIC_1 })).not.toBeDisabled()
  })
})
