import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { fireEvent, within } from '@testing-library/react'
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

// The photo tile itself is a role="button" whose name-from-content equals the
// pick label, so filter to the real <button> elements for pick selectors.
function getPickButtons(label = 'pilih foto untuk mini rapor') {
  return screen
    .getAllByRole('button', { name: label })
    .filter((el): el is HTMLButtonElement => el.tagName === 'BUTTON')
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

  it('shows the empty-state message (not an error) when the child has no photos', async () => {
    vi.mocked(photoService.getByParticipant).mockResolvedValue([] as never)

    await renderChildPage()

    // PhotoGallery's dedicated empty state with the child's name…
    expect(screen.getByText('Belum ada foto untuk Budi')).toBeInTheDocument()
    expect(screen.getByText('0/10 foto')).toBeInTheDocument()
    // …and no per-photo actions exist without photos.
    expect(screen.queryByRole('button', { name: 'pilih foto untuk mini rapor' })).toBeNull()
    expect(screen.queryByText('Terjadi Kesalahan')).toBeNull()
  })

  it('calls the report-pick service when picking a photo, then shows the Mini Rapor badge', async () => {
    await renderChildPage()

    const pickButtons = getPickButtons()
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

    // Foto terpilih: badge teks "Mini Rapor" + tombol batal pilihan berlabel jelas
    expect(screen.getByText('Mini Rapor')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'pilih foto untuk mini rapor' })).toBeNull()
    expect(
      screen.getAllByRole('button', { name: 'batalkan pilihan untuk mini rapor' }).length,
    ).toBeGreaterThan(0)
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

describe('GaleriChildPage: gallery sort dropdown and report badge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    vi.mocked(photoService.setReportPick).mockResolvedValue(photo as never)
    vi.mocked(photoService.clearReportPick).mockResolvedValue(undefined)
    useToastStore.setState({ toasts: [] })
    mockHappyPath()
  })

  it('renders the sort select defaulted to Terbaru and reorders photos by size', async () => {
    // Server order (created_at DESC): small terbaru dulu, big lebih lama —
    // urutan beda dengan ukuran, jadi pergantian sort terlihat di DOM.
    const smallPhoto = { ...photo, id: 'ph-small', created_at: '2026-09-30T03:00:00Z', file_size: 100 }
    const bigPhoto = { ...photo, id: 'ph-big', created_at: '2026-09-30T01:00:00Z', file_size: 9000 }
    vi.mocked(photoService.getByParticipant).mockResolvedValue([smallPhoto, bigPhoto] as never)

    const { container } = await renderChildPage()

    const select = screen.getByRole('combobox', { name: 'Urutkan foto' })
    expect(select).toHaveValue('newest')
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Terbaru', 'Terlama', 'Ukuran Terbesar', 'Ukuran Terkecil'])

    const tileSrcs = () =>
      Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('src') ?? '')

    // Default 'newest' = created_at DESC
    expect(tileSrcs()[0]).toContain('ph-small')
    expect(tileSrcs()[1]).toContain('ph-big')

    await act(async () => {
      fireEvent.change(select, { target: { value: 'largest' } })
    })

    expect(select).toHaveValue('largest')
    expect(tileSrcs()[0]).toContain('ph-big')
    expect(tileSrcs()[1]).toContain('ph-small')
  })

  it('shows a text badge with aria-label on report photos', async () => {
    vi.mocked(photoService.getByParticipant).mockResolvedValue([
      { ...photo, id: 'ph-report', is_report_photo: true },
      { ...photo, id: 'ph-normal', is_report_photo: false },
    ] as never)

    await renderChildPage()

    const badge = screen.getByLabelText('Foto Raport')
    // Teks, bukan warna saja
    expect(badge).toHaveTextContent('Foto Raport')
    // Foto non-rapor tidak dapat badge yang sama
    expect(screen.getAllByLabelText('Foto Raport')).toHaveLength(1)
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

    const pickButtons = getPickButtons()
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

  it('shows an error toast when report picks fail to load (never silent), keeping the grid usable', async () => {
    vi.mocked(photoService.getReportPicks).mockRejectedValue(new TypeError('fetch failed'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

    try {
      await renderChildPage()
      await act(async () => { }) // drain the void loadPicks() rejection → toast

      // The hook logs the cause and toasts picksLoadError — no silent swallow.
      expect(errorSpy).toHaveBeenCalledWith(
        '[useSmartPhotos.loadPicks]',
        expect.any(TypeError),
      )
      const errorToasts = useToastStore.getState().toasts.filter((t) => t.type === 'error')
      expect(
        errorToasts.some((t) => t.message === 'Gagal memuat pilihan foto rapor.'),
      ).toBe(true)

      // Picks degrade to an empty list: the photo grid still renders (no
      // empty-state regression, no crash) and pick actions remain available.
      expect(screen.getByText('Galeri Foto — Budi')).toBeInTheDocument()
      expect(screen.getByText('1/10 foto')).toBeInTheDocument()
      expect(getPickButtons().length).toBeGreaterThan(0)
      expect(screen.queryByText('Terjadi Kesalahan')).toBeNull()
    } finally {
      errorSpy.mockRestore()
    }
  })
})
