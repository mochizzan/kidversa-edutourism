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

// Header toggle labels (id is the source locale; tests run forced to 'id').
const START_LABEL = 'Pilih Foto Mini Rapor'
const SAVE_LABEL = 'Simpan Pilihan'
const CANCEL_LABEL = 'Batal'
const HINT =
  'Klik foto untuk memilih (maksimal 1 foto), lalu klik Simpan Pilihan. Klik Batal untuk keluar tanpa menyimpan.'
const NO_PHOTOS_TOAST = 'Belum ada foto yang bisa dipilih.'
const NOTHING_SELECTED_TOAST = 'Belum ada foto yang dipilih. Klik satu foto terlebih dahulu.'
const PICK_ERROR_TOAST = 'Foto rapor gagal dipilih'

// The photo tile is a role="button" wrapper around its media URL — locate a
// tile by the photo id embedded in the img src.
function getTile(container: HTMLElement, photoId: string) {
  const tile = Array.from(container.querySelectorAll('[role="button"]')).find((el) =>
    el.querySelector(`img[src*="${photoId}"]`),
  )
  if (!tile) throw new Error(`photo tile ${photoId} not found`)
  return tile as HTMLElement
}

async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el)
  })
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

async function enterSelectMode() {
  await click(screen.getByRole('button', { name: START_LABEL }))
}

function toastMessages(type?: string) {
  return useToastStore
    .getState()
    .toasts.filter((t) => !type || t.type === type)
    .map((t) => t.message)
}

function mockHappyPath() {
  vi.mocked(sessionService.getParticipantById).mockResolvedValue(participant as never)
  vi.mocked(sessionService.getById).mockResolvedValue(detail as never)
  vi.mocked(sessionService.getStages).mockResolvedValue([
    { id: 'ss1', session_id: 's-1', program_stage_id: 'ps1', status: 'IN_PROGRESS' },
  ] as never)
  vi.mocked(programService.getStages).mockResolvedValue([
    { id: 'ps1', program_id: 'p1', sequence_order: 1, name: 'Topik Satu', content_type: 'TEXT' },
  ] as never)
  vi.mocked(photoService.getByParticipant).mockResolvedValue([photo] as never)
  vi.mocked(photoService.getReportPicks).mockResolvedValue([] as never)
}

describe('GaleriChildPage: mini rapor select-mode toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    vi.mocked(photoService.setReportPick).mockResolvedValue(photo as never)
    vi.mocked(photoService.clearReportPick).mockResolvedValue(undefined)
    useToastStore.setState({ toasts: [] })
    mockHappyPath()
  })

  it('enters select mode from the header toggle and marks a clicked photo with the Mini Rapor badge', async () => {
    const { container } = await renderChildPage()

    // Idle: single-state toggle, no mode chrome, no badge yet.
    expect(screen.getByRole('button', { name: START_LABEL })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SAVE_LABEL })).toBeNull()
    expect(screen.queryByText(HINT)).toBeNull()
    expect(screen.queryByText('Mini Rapor')).toBeNull()

    await enterSelectMode()

    expect(screen.queryByRole('button', { name: START_LABEL })).toBeNull()
    expect(screen.getByRole('button', { name: SAVE_LABEL })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: CANCEL_LABEL })).toBeInTheDocument()
    expect(screen.getByText(HINT)).toBeInTheDocument()

    // Clicking a photo in select mode marks it pending — NOT fullscreen.
    await click(getTile(container, 'ph-1'))
    expect(within(getTile(container, 'ph-1')).getByText('Mini Rapor')).toBeInTheDocument()
    expect(screen.queryByText('Hapus Foto')).toBeNull()
    expect(photoService.setReportPick).not.toHaveBeenCalled()
  })

  it('keeps at most one pending selection: a second photo replaces the first, re-click deselects', async () => {
    vi.mocked(photoService.getByParticipant).mockResolvedValue([
      { ...photo, id: 'ph-1', created_at: '2026-09-30T02:00:00Z' },
      { ...photo, id: 'ph-2', created_at: '2026-09-30T03:00:00Z' },
    ] as never)

    const { container } = await renderChildPage()
    await enterSelectMode()

    await click(getTile(container, 'ph-1'))
    expect(within(getTile(container, 'ph-1')).getByText('Mini Rapor')).toBeInTheDocument()

    // Selecting another photo replaces the previous one (max 1 selected).
    await click(getTile(container, 'ph-2'))
    expect(within(getTile(container, 'ph-2')).getByText('Mini Rapor')).toBeInTheDocument()
    expect(within(getTile(container, 'ph-1')).queryByText('Mini Rapor')).toBeNull()
    expect(screen.getAllByText('Mini Rapor')).toHaveLength(1)

    // Re-clicking the selected photo deselects it.
    await click(getTile(container, 'ph-2'))
    expect(screen.queryByText('Mini Rapor')).toBeNull()
  })

  it('saves the pending selection with SIMPAN PILIHAN (photo id + active stage) and exits select mode', async () => {
    const { container } = await renderChildPage()
    await enterSelectMode()
    await click(getTile(container, 'ph-1'))
    await click(screen.getByRole('button', { name: SAVE_LABEL }))

    expect(photoService.setReportPick).toHaveBeenCalledTimes(1)
    expect(photoService.setReportPick).toHaveBeenCalledWith({
      participant_id: 'c-1',
      session_id: 's-1',
      program_stage_id: 'ps1',
      photo_id: 'ph-1',
    })

    // Exited select mode, and the saved pick drives the badge (synced mini rapor).
    expect(screen.getByRole('button', { name: START_LABEL })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SAVE_LABEL })).toBeNull()
    expect(screen.queryByRole('button', { name: CANCEL_LABEL })).toBeNull()
    expect(within(getTile(container, 'ph-1')).getByText('Mini Rapor')).toBeInTheDocument()
    expect(toastMessages('error')).toHaveLength(0)
  })

  it('shows a user-facing message and calls no API when saving with nothing selected', async () => {
    await renderChildPage()
    await enterSelectMode()

    await click(screen.getByRole('button', { name: SAVE_LABEL }))

    expect(photoService.setReportPick).not.toHaveBeenCalled()
    expect(toastMessages('warning')).toContain(NOTHING_SELECTED_TOAST)
    // Keeps select mode so the user can still pick.
    expect(screen.getByRole('button', { name: SAVE_LABEL })).toBeInTheDocument()
  })

  it('discards the pending selection when exiting select mode without saving (Batal)', async () => {
    const { container } = await renderChildPage()
    await enterSelectMode()
    await click(getTile(container, 'ph-1'))
    expect(within(getTile(container, 'ph-1')).getByText('Mini Rapor')).toBeInTheDocument()

    await click(screen.getByRole('button', { name: CANCEL_LABEL }))

    expect(photoService.setReportPick).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: START_LABEL })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SAVE_LABEL })).toBeNull()
    expect(screen.queryByText('Mini Rapor')).toBeNull()

    // Mode is gone: photo clicks open fullscreen again.
    await click(getTile(container, 'ph-1'))
    expect(screen.getByText('Hapus Foto')).toBeInTheDocument()
    expect(photoService.setReportPick).not.toHaveBeenCalled()
  })

  it('opens the fullscreen viewer when clicking a photo outside select mode', async () => {
    const { container } = await renderChildPage()

    await click(getTile(container, 'ph-1'))

    expect(screen.getByText('Hapus Foto')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SAVE_LABEL })).toBeNull()
    expect(photoService.setReportPick).not.toHaveBeenCalled()
  })

  it('shows a message and does not enter select mode when the child has no photos', async () => {
    vi.mocked(photoService.getByParticipant).mockResolvedValue([] as never)

    await renderChildPage()
    await enterSelectMode()

    expect(toastMessages('warning')).toContain(NO_PHOTOS_TOAST)
    expect(screen.queryByRole('button', { name: SAVE_LABEL })).toBeNull()
    expect(screen.getByRole('button', { name: START_LABEL })).toBeInTheDocument()
    expect(photoService.setReportPick).not.toHaveBeenCalled()
  })
})

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
    // …and no select mode is possible without photos.
    expect(screen.getByRole('button', { name: START_LABEL })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SAVE_LABEL })).toBeNull()
    expect(screen.queryByText('Terjadi Kesalahan')).toBeNull()
  })

  it('disables entering select mode with a visible reason when photo consent is missing', async () => {
    vi.mocked(sessionService.getParticipantById).mockResolvedValue(
      { ...participant, consent_photo: false } as never,
    )

    await renderChildPage()

    expect(screen.getByText('Izin foto belum diberikan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: START_LABEL })).toBeDisabled()

    // Tambah Foto is also locked with the same visible reason
    expect(screen.getByRole('button', { name: 'Tambah Foto' })).toBeDisabled()

    await click(screen.getByRole('button', { name: START_LABEL }))
    expect(screen.queryByRole('button', { name: SAVE_LABEL })).toBeNull()
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
    // Select mode cannot be entered; delete stays locked with the reason as its accessible name.
    expect(screen.getByRole('button', { name: START_LABEL })).toBeDisabled()
    const lockedDelete = screen
      .getAllByRole('button', { name: 'Bukan kelompok Anda' })
      .filter((el) => el.tagName === 'BUTTON')
    expect(lockedDelete).toHaveLength(1)
    expect(lockedDelete[0]).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Tambah Foto' })).toBeDisabled()

    await click(screen.getByRole('button', { name: START_LABEL }))
    expect(screen.queryByRole('button', { name: SAVE_LABEL })).toBeNull()
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

  it('stays in select mode with the selection intact when the save fails', async () => {
    vi.mocked(photoService.setReportPick).mockRejectedValue(new Error('server rejected'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

    try {
      const { container } = await renderChildPage()
      await enterSelectMode()
      await click(getTile(container, 'ph-1'))
      await click(screen.getByRole('button', { name: SAVE_LABEL }))

      expect(toastMessages('error')).toContain(PICK_ERROR_TOAST)
      // Still in select mode with the pending selection — user can retry or cancel.
      expect(screen.getByRole('button', { name: SAVE_LABEL })).toBeInTheDocument()
      expect(within(getTile(container, 'ph-1')).getByText('Mini Rapor')).toBeInTheDocument()
      expect(photoService.setReportPick).toHaveBeenCalledTimes(1)
    } finally {
      errorSpy.mockRestore()
    }
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
      expect(toastMessages('error')).toContain('Gagal memuat pilihan foto rapor.')

      // Picks degrade to an empty list: the photo grid still renders (no
      // empty-state regression, no crash) and select mode remains available.
      expect(screen.getByText('Galeri Foto — Budi')).toBeInTheDocument()
      expect(screen.getByText('1/10 foto')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: START_LABEL })).toBeEnabled()
      expect(screen.queryByText('Terjadi Kesalahan')).toBeNull()
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('GaleriChildPage: save-flow edge cases (in-flight guard, stale selection, unmount)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    vi.mocked(photoService.setReportPick).mockResolvedValue(photo as never)
    vi.mocked(photoService.clearReportPick).mockResolvedValue(undefined)
    useToastStore.setState({ toasts: [] })
    mockHappyPath()
  })

  /** Promise yang dijadwalkan test — menahan save in-flight selama yang diuji. */
  function deferred<T>() {
    let resolve!: (v: T) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  it('double-clicking SIMPAN while a save is in flight issues exactly one POST', async () => {
    const d = deferred<typeof photo>()
    vi.mocked(photoService.setReportPick).mockReturnValue(d.promise as never)
    const { container } = await renderChildPage()
    await enterSelectMode()
    await click(getTile(container, 'ph-1'))

    await click(screen.getByRole('button', { name: SAVE_LABEL }))
    // Save berjalan: tombol Simpan & Batal nonaktif (dan guard di handler).
    expect(screen.getByRole('button', { name: SAVE_LABEL })).toBeDisabled()
    expect(screen.getByRole('button', { name: CANCEL_LABEL })).toBeDisabled()

    await click(screen.getByRole('button', { name: SAVE_LABEL }))
    expect(photoService.setReportPick).toHaveBeenCalledTimes(1)

    await act(async () => {
      d.resolve(photo)
    })
    // Satu POST sukses → keluar select mode.
    expect(screen.getByRole('button', { name: START_LABEL })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SAVE_LABEL })).toBeNull()
  })

  it('Batal pressed during an in-flight save does not exit select mode; the save result applies when it resolves', async () => {
    const d = deferred<typeof photo>()
    vi.mocked(photoService.setReportPick).mockReturnValue(d.promise as never)
    const { container } = await renderChildPage()
    await enterSelectMode()
    await click(getTile(container, 'ph-1'))
    await click(screen.getByRole('button', { name: SAVE_LABEL }))

    await click(screen.getByRole('button', { name: CANCEL_LABEL }))
    // Mode tidak keluar di tengah save (tanpa state basah)…
    expect(screen.getByRole('button', { name: SAVE_LABEL })).toBeInTheDocument()
    expect(screen.getByText(HINT)).toBeInTheDocument()
    expect(within(getTile(container, 'ph-1')).getByText('Mini Rapor')).toBeInTheDocument()
    expect(photoService.setReportPick).toHaveBeenCalledTimes(1)

    // …dan hasil save tetap diterapkan begitu server menjawab.
    await act(async () => {
      d.resolve(photo)
    })
    expect(screen.getByRole('button', { name: START_LABEL })).toBeInTheDocument()
    expect(within(getTile(container, 'ph-1')).getByText('Mini Rapor')).toBeInTheDocument()
    expect(toastMessages('error')).toHaveLength(0)
  })

  it('a save that resolves after unmount is ignored safely (no crash, no unhandled rejection, single POST)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
    try {
      const d = deferred<typeof photo>()
      vi.mocked(photoService.setReportPick).mockReturnValue(d.promise as never)
      const { container, unmount } = await renderChildPage()
      await enterSelectMode()
      await click(getTile(container, 'ph-1'))
      await click(screen.getByRole('button', { name: SAVE_LABEL }))
      expect(photoService.setReportPick).toHaveBeenCalledTimes(1)

      unmount()
      await act(async () => {
        d.resolve(photo)
      })

      // Transisi state setelah unmount dilewati (mountedRef) — tanpa error.
      expect(errorSpy).not.toHaveBeenCalled()
      expect(toastMessages('error')).toHaveLength(0)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('deleting the pending photo during select mode clears the selection; SIMPAN then warns without POSTing a dead id', async () => {
    const { container } = await renderChildPage()
    await enterSelectMode()
    await click(getTile(container, 'ph-1'))
    expect(within(getTile(container, 'ph-1')).getByText('Mini Rapor')).toBeInTheDocument()

    // Refresh setelah delete tidak lagi mengembalikan foto itu.
    vi.mocked(photoService.getByParticipant).mockResolvedValue([] as never)
    const trash = within(getTile(container, 'ph-1')).getByRole('button', { name: 'Hapus Foto' })
    await click(trash)
    const dialog = screen.getByRole('dialog')
    await click(within(dialog).getByRole('button', { name: 'Hapus' }))

    // Pilihan tertunda dibersihkan: tidak ada badge, grid kosong, mode aktif.
    expect(screen.queryByText('Mini Rapor')).toBeNull()
    expect(screen.getByText('Belum ada foto untuk Budi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: SAVE_LABEL })).toBeInTheDocument()

    // SIMPAN tidak pernah mengirim photo_id mati — hanya peringatan.
    await click(screen.getByRole('button', { name: SAVE_LABEL }))
    expect(photoService.setReportPick).not.toHaveBeenCalled()
    expect(toastMessages('warning')).toContain(NOTHING_SELECTED_TOAST)
    expect(screen.getByRole('button', { name: SAVE_LABEL })).toBeInTheDocument()
  })
})
