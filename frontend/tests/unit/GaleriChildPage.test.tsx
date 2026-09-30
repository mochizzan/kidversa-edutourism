import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'

// ── Mocks (registered before importing the page) ──────────────────────────
vi.mock('@/core/services/sessions', () => ({
  sessionService: {
    getById: vi.fn(),
    getStages: vi.fn(),
    getParticipantById: vi.fn(),
  },
}))

vi.mock('@/core/services/programs', () => ({
  programService: {
    getStages: vi.fn(),
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

vi.mock('@/core/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

// Import after mocks are registered
import GaleriChildPage from '@/features/fasilitator/pages/galeri/GaleriChildPage'
import { sessionService } from '@/core/services/sessions'
import { programService } from '@/core/services/programs'
import { photoService } from '@/core/services/photos'
import { useAuth } from '@/core/hooks/useAuth'
import { useToastStore } from '@/core/stores/toastStore'
import { SessionStatus } from '@/core/types/enums'

const session = {
  id: 's-1',
  tenant_id: 't1',
  program_id: 'p1',
  name: 'Sesi Galeri',
  session_date: '2026-09-30',
  location: 'Ruang 1',
  status: SessionStatus.ACTIVE,
  created_by: 'u1',
  created_at: '2026-09-30T01:00:00Z',
}

const group = {
  id: 'g-mine',
  session_id: 's-1',
  name: 'Kelompok A',
  status: 'IN_PROGRESS',
  current_session_stage_id: 'ss1',
  facilitator_id: 'u1',
  created_at: '2026-09-30T01:00:00Z',
}

const detail = { ...session, stages: [], groups: [{ ...group, participants: [] }] }

const participant = {
  id: 'c-1',
  session_id: 's-1',
  group_id: 'g-mine',
  child_name: 'Budi',
  child_age: 7,
  school_name: 'SD Satu',
  parent_phone: '0812',
  consent_photo: true,
  created_at: '2026-09-30T01:00:00Z',
}

const photo = {
  id: 'ph-1',
  participant_id: 'c-1',
  session_id: 's-1',
  original_file_url: '',
  is_report_photo: false,
  taken_by: 'u1',
  taken_at: '2026-09-30T02:00:00Z',
}

async function renderChildPage() {
  const result = render(
    <MemoryRouter initialEntries={['/fasilitator/galeri/peserta/c-1']}>
      <Routes>
        <Route path="/fasilitator/galeri/peserta/:childId" element={<GaleriChildPage />} />
        <Route
          path="/fasilitator/groups/:groupId/children/:childId/photo"
          element={<div>HALAMAN KAMERA</div>}
        />
      </Routes>
    </MemoryRouter>,
  )
  // Flush the fetch chain (participant → session detail + stages → topics → photos/picks)
  await act(async () => { })
  return result
}

function mockHappyPath() {
  vi.mocked(sessionService.getParticipantById).mockResolvedValue(participant as never)
  vi.mocked(sessionService.getById).mockResolvedValue(detail as never)
  vi.mocked(sessionService.getStages).mockResolvedValue([
    { id: 'ss1', session_id: 's-1', program_stage_id: 'ps1', status: 'IN_PROGRESS' },
  ] as never)
  vi.mocked(programService.getStages).mockResolvedValue([
    { id: 'ps1', program_id: 'p1', sequence_order: 1, name: 'Topik Satu', content_type: 'TEXT', is_photo_stage: false },
  ] as never)
  vi.mocked(photoService.getByParticipant).mockResolvedValue([photo] as never)
  vi.mocked(photoService.getReportPicks).mockResolvedValue([] as never)
}

describe('GaleriChildPage: actions and locks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    vi.mocked(photoService.setReportPick).mockResolvedValue(photo as never)
    vi.mocked(photoService.clearReportPick).mockResolvedValue(undefined)
    mockHappyPath()
  })

  it('renders the photo grid with topics and navigates Tambah Foto to the camera capture route', async () => {
    await renderChildPage()

    expect(screen.getByText('Galeri Foto — Budi')).toBeInTheDocument()
    expect(screen.getByText('Topik Satu')).toBeInTheDocument()
    expect(screen.getByText('1/10 foto')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Foto' }))
    expect(screen.getByText('HALAMAN KAMERA')).toBeInTheDocument()
  })

  it('calls the report-pick service when picking a photo as foto rapor', async () => {
    await renderChildPage()

    const pickButtons = screen.getAllByRole('button', { name: 'Jadikan foto rapor' })
    expect(pickButtons.length).toBeGreaterThan(0)
    await act(async () => {
      fireEvent.click(pickButtons[0])
    })

    expect(photoService.setReportPick).toHaveBeenCalledWith({
      participant_id: 'c-1',
      session_id: 's-1',
      program_stage_id: 'ps1',
      photo_id: 'ph-1',
    })
  })

  it('disables the pick action with a visible reason when photo consent is missing', async () => {
    vi.mocked(sessionService.getParticipantById).mockResolvedValue(
      { ...participant, consent_photo: false } as never,
    )

    await renderChildPage()

    expect(screen.getByText('Izin foto belum diberikan')).toBeInTheDocument()
    const pickButtons = screen.getAllByRole('button', { name: 'Izin foto belum diberikan' })
    expect(pickButtons.length).toBeGreaterThan(0)
    expect(pickButtons[0]).toBeDisabled()

    // Tambah Foto is also locked with the same visible reason
    expect(screen.getByRole('button', { name: 'Tambah Foto' })).toBeDisabled()

    await act(async () => {
      fireEvent.click(pickButtons[0])
    })
    expect(photoService.setReportPick).not.toHaveBeenCalled()
  })

  it('disables pick and delete with a visible reason when the group is not owned', async () => {
    vi.mocked(sessionService.getById).mockResolvedValue({
      ...detail,
      groups: [{ ...group, facilitator_id: 'u2', participants: [] }],
    } as never)

    await renderChildPage()

    // Read-only banner + reason on the locked actions
    expect(
      screen.getByText('Bukan kelompok Anda — foto hanya dapat dilihat (mode baca saja).'),
    ).toBeInTheDocument()
    // Pick + delete buttons both carry the lock reason as their accessible name
    const lockedButtons = screen.getAllByRole('button', { name: 'Bukan kelompok Anda' })
    expect(lockedButtons.length).toBeGreaterThanOrEqual(2)
    expect(lockedButtons[0]).toBeDisabled()
    expect(lockedButtons[1]).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Tambah Foto' })).toBeDisabled()

    await act(async () => {
      fireEvent.click(lockedButtons[0])
    })
    expect(photoService.setReportPick).not.toHaveBeenCalled()
  })

  it('shows an error state with retry when the participant fetch fails, then recovers', async () => {
    vi.mocked(sessionService.getParticipantById).mockRejectedValueOnce(new TypeError('fetch failed'))

    await renderChildPage()

    expect(screen.getByText('Terjadi Kesalahan')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Coba Lagi' })

    vi.mocked(sessionService.getParticipantById).mockResolvedValue(participant as never)
    await act(async () => {
      fireEvent.click(retry)
    })

    expect(screen.getByText('Galeri Foto — Budi')).toBeInTheDocument()
    expect(screen.queryByText('Terjadi Kesalahan')).toBeNull()
  })

  it('shows the not-found error state when the participant does not exist (404)', async () => {
    vi.mocked(sessionService.getParticipantById).mockResolvedValue(null)

    await renderChildPage()

    expect(screen.getByText('Anak Tidak Ditemukan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Coba Lagi' })).toBeInTheDocument()
    expect(photoService.getByParticipant).not.toHaveBeenCalled()
  })
})

describe('GaleriChildPage: failed photo loads and mutations surface readable errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    vi.mocked(photoService.setReportPick).mockResolvedValue(photo as never)
    vi.mocked(photoService.clearReportPick).mockResolvedValue(undefined)
    useToastStore.setState({ toasts: [] })
    mockHappyPath()
  })

  it('shows an error toast when the server rejects a foto rapor pick', async () => {
    vi.mocked(photoService.setReportPick).mockRejectedValue(new Error('server rejected'))

    await renderChildPage()

    const pickButtons = screen.getAllByRole('button', { name: 'Jadikan foto rapor' })
    await act(async () => {
      fireEvent.click(pickButtons[0])
    })

    const errorToasts = useToastStore.getState().toasts.filter((t) => t.type === 'error')
    expect(errorToasts.some((t) => t.message === 'Foto rapor gagal dipilih')).toBe(true)
  })

  it('replaces the photo grid with an error state when the photo fetch fails, then retries', async () => {
    vi.mocked(photoService.getByParticipant).mockRejectedValueOnce(new TypeError('fetch failed'))

    await renderChildPage()

    // Partial render: participant + topics stay, only the grid owns the error
    expect(screen.getByText('Topik Satu')).toBeInTheDocument()
    expect(
      screen.getByText('Gagal terhubung ke server. Periksa koneksi internet Anda.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('1/10 foto')).toBeNull()

    const retry = screen.getByRole('button', { name: 'Coba Lagi' })
    vi.mocked(photoService.getByParticipant).mockResolvedValue([photo] as never)
    await act(async () => {
      fireEvent.click(retry)
    })

    expect(screen.getByText('1/10 foto')).toBeInTheDocument()
    expect(
      screen.queryByText('Gagal terhubung ke server. Periksa koneksi internet Anda.'),
    ).toBeNull()
  })
})
