import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { fireEvent, within } from '@testing-library/react'
import { render, screen } from './test-utils'

// ── Mocks (registered before importing the pages) ─────────────────────────
vi.mock('@/core/services/sessions', () => ({
  sessionService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getGroups: vi.fn(),
    getStages: vi.fn(),
    getParticipantById: vi.fn(),
  },
}))

vi.mock('@/core/services/participants', () => ({
  participantService: {
    getAll: vi.fn(),
  },
}))

vi.mock('@/core/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

// Import after mocks are registered
import GaleriSessionPage from '@/features/fasilitator/pages/galeri/GaleriSessionPage'
import GaleriGroupPage from '@/features/fasilitator/pages/galeri/GaleriGroupPage'
import { sessionService } from '@/core/services/sessions'
import { participantService } from '@/core/services/participants'
import { useAuth } from '@/core/hooks/useAuth'
import { SessionStatus } from '@/core/types/enums'

function envelope(data: unknown[]) {
  return { data, total: data.length, page: 1, limit: Math.max(data.length, 1), totalPages: 1 } as never
}

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

const detail = {
  ...session,
  stages: [],
  groups: [
    { id: 'g-mine', session_id: 's-1', name: 'Kelompok Milik Saya', status: 'IN_PROGRESS', facilitator_id: 'u1', created_at: '2026-09-30T01:00:00Z', participants: [] },
    { id: 'g-other', session_id: 's-1', name: 'Kelompok Orang Lain', status: 'IN_PROGRESS', facilitator_id: 'u2', created_at: '2026-09-30T01:00:00Z', participants: [] },
  ],
}

async function renderSessionPage(path = '/fasilitator/galeri/sesi/s-1') {
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/fasilitator/galeri/sesi/:sessionId" element={<GaleriSessionPage />} />
        <Route path="/fasilitator/galeri/kelompok/:groupId" element={<div>HALAMAN KELOMPOK</div>} />
      </Routes>
    </MemoryRouter>,
  )
  await act(async () => { })
  return result
}

async function renderGroupPage(
  path: string,
  state?: { sessionId?: string; sessionName?: string },
) {
  const result = render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/fasilitator/galeri/kelompok/:groupId" element={<GaleriGroupPage />} />
        <Route path="/fasilitator/galeri/peserta/:childId" element={<div>HALAMAN PESERTA</div>} />
        <Route path="/fasilitator/galeri" element={<div>HALAMAN GALERI</div>} />
      </Routes>
    </MemoryRouter>,
  )
  await act(async () => { })
  return result
}

describe('GaleriSessionPage: groups list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    vi.mocked(sessionService.getById).mockResolvedValue(detail as never)
    vi.mocked(sessionService.getGroups).mockResolvedValue([
      { id: 'g-mine', session_id: 's-1', name: 'Kelompok Milik Saya', status: 'IN_PROGRESS', facilitator_id: 'u1', created_at: '2026-09-30T01:00:00Z' },
      { id: 'g-other', session_id: 's-1', name: 'Kelompok Orang Lain', status: 'IN_PROGRESS', facilitator_id: 'u2', created_at: '2026-09-30T01:00:00Z' },
    ] as never)
  })

  it('locks non-owned groups while keeping owned groups enterable', async () => {
    await renderSessionPage()

    expect(screen.getByRole('heading', { name: 'Sesi Galeri' })).toBeInTheDocument()
    expect(screen.getByText('Kelompok Milik Saya')).toBeInTheDocument()
    expect(screen.getByText('Kelompok Orang Lain')).toBeInTheDocument()

    const locked = screen.getByRole('button', { name: /Kelompok Orang Lain/ })
    // Keyboard-reachable: a real <button> (not a tabIndex=-1 div).
    expect(locked.tagName).toBe('BUTTON')
    expect(screen.getAllByText('Bukan kelompok Anda').length).toBeGreaterThan(0)

    fireEvent.click(locked)
    // Non-owner click opens the shared lock dialog instead of navigating.
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Bukan kelompok Anda')).toBeInTheDocument()
    expect(
      within(dialog).getByText('Hanya fasilitator kelompok ini yang dapat membuka galeri pesertanya.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('HALAMAN KELOMPOK')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Kelompok Milik Saya/ }))
    expect(screen.getByText('HALAMAN KELOMPOK')).toBeInTheDocument()
  })

  it('consumes the server is_owner flag over the facilitator_id match', async () => {
    // g-mine: matches user id but server says NOT owned → locked modal.
    // g-other: foreign facilitator but server says owned → enterable + badge.
    vi.mocked(sessionService.getGroups).mockResolvedValue([
      { id: 'g-mine', session_id: 's-1', name: 'Kelompok Milik Saya', status: 'IN_PROGRESS', facilitator_id: 'u1', is_owner: false, created_at: '2026-09-30T01:00:00Z' },
      { id: 'g-other', session_id: 's-1', name: 'Kelompok Orang Lain', status: 'IN_PROGRESS', facilitator_id: 'u2', is_owner: true, created_at: '2026-09-30T01:00:00Z' },
    ] as never)

    await renderSessionPage()

    const mine = screen.getByRole('button', { name: /Kelompok Milik Saya/ })
    const other = screen.getByRole('button', { name: /Kelompok Orang Lain/ })

    fireEvent.click(mine)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText('HALAMAN KELOMPOK')).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(within(other).getByText('Kelompok Anda')).toBeInTheDocument()
    fireEvent.click(other)
    expect(screen.getByText('HALAMAN KELOMPOK')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows an error state with retry when the session is missing (404 → null)', async () => {
    vi.mocked(sessionService.getById).mockResolvedValue(null)

    await renderSessionPage()

    expect(screen.getByText('Sesi tidak ditemukan')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Coba Lagi' })

    vi.mocked(sessionService.getById).mockResolvedValue(detail as never)
    await act(async () => {
      fireEvent.click(retry)
    })
    expect(screen.getByRole('heading', { name: 'Sesi Galeri' })).toBeInTheDocument()
    expect(screen.queryByText('Sesi tidak ditemukan')).toBeNull()
  })

  it('distinguishes an empty group list from a missing session', async () => {
    vi.mocked(sessionService.getGroups).mockResolvedValue([] as never)

    await renderSessionPage()

    expect(screen.getByText('Belum ada kelompok')).toBeInTheDocument()
    expect(screen.queryByText('Sesi tidak ditemukan')).toBeNull()
  })

  it('shows an error state with retry when the groups fetch rejects', async () => {
    vi.mocked(sessionService.getGroups).mockRejectedValueOnce(new TypeError('fetch failed'))

    await renderSessionPage()

    expect(screen.getByText('Gagal terhubung ke server. Periksa koneksi internet Anda.')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Coba Lagi' })

    vi.mocked(sessionService.getGroups).mockResolvedValue([
      { id: 'g-mine', session_id: 's-1', name: 'Kelompok Milik Saya', status: 'IN_PROGRESS', facilitator_id: 'u1', created_at: '2026-09-30T01:00:00Z' },
    ] as never)
    await act(async () => {
      fireEvent.click(retry)
    })
    expect(screen.getByText('Kelompok Milik Saya')).toBeInTheDocument()
  })
})

describe('GaleriGroupPage: participants list and guard', () => {
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

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    vi.mocked(participantService.getAll).mockResolvedValue(envelope([participant]))
    vi.mocked(sessionService.getById).mockResolvedValue(detail as never)
  })

  it('lists participants of an owned group and navigates to the per-peserta gallery', async () => {
    await renderGroupPage('/fasilitator/galeri/kelompok/g-mine', { sessionId: 's-1', sessionName: 'Sesi Galeri' })

    expect(screen.getByText('Budi')).toBeInTheDocument()
    expect(screen.getByText('Kelompok Milik Saya')).toBeInTheDocument()

    const row = screen.getByRole('button', { name: /Budi/ })
    // Granted consent: no lock reason on the row.
    expect(row.getAttribute('title')).toBeNull()

    fireEvent.click(row)
    expect(screen.getByText('HALAMAN PESERTA')).toBeInTheDocument()
  })

  it('flags missing consent on the row (reason + lock) while the gallery entry stays reachable', async () => {
    vi.mocked(participantService.getAll).mockResolvedValue(
      envelope([{ ...participant, consent_photo: false }]),
    )

    await renderGroupPage('/fasilitator/galeri/kelompok/g-mine', { sessionId: 's-1', sessionName: 'Sesi Galeri' })

    const row = screen.getByRole('button', { name: /Budi/ })
    // Visible WHY: the same Indonesian reason the capture guards use as their
    // disabled tooltip, surfaced as the row's native title…
    expect(row.getAttribute('title')).toBe('Izin foto belum diberikan')
    // …plus the existing warning badge (CameraPage's consent-row pattern).
    expect(within(row).getByText('Tidak ada izin')).toBeInTheDocument()

    // Gallery viewing remains reachable: the row still opens the per-peserta
    // gallery. Capture itself is gated on THAT page (Tambah Foto/add-card),
    // on CameraPage's /photo rows and by SmartPhotoPage's lock screen.
    fireEvent.click(row)
    expect(screen.getByText('HALAMAN PESERTA')).toBeInTheDocument()
  })

  it('guards a non-owned group: locked view, participants stay hidden', async () => {
    await renderGroupPage('/fasilitator/galeri/kelompok/g-other', { sessionId: 's-1', sessionName: 'Sesi Galeri' })

    expect(screen.getByText('Bukan kelompok Anda')).toBeInTheDocument()
    expect(screen.getByText('Hanya fasilitator kelompok ini yang dapat membuka galeri pesertanya.')).toBeInTheDocument()
    expect(screen.queryByText('Budi')).toBeNull()
    expect(screen.queryByText('HALAMAN PESERTA')).toBeNull()
  })

  it('shows the empty state for an owned group with no participants', async () => {
    vi.mocked(participantService.getAll).mockResolvedValue(envelope([]))

    await renderGroupPage('/fasilitator/galeri/kelompok/g-mine', { sessionId: 's-1', sessionName: 'Sesi Galeri' })

    expect(screen.getByText('Belum ada peserta')).toBeInTheDocument()
    expect(screen.queryByText('Bukan kelompok Anda')).toBeNull()
  })

  it('shows an error state with retry when the participants fetch rejects', async () => {
    vi.mocked(participantService.getAll).mockRejectedValueOnce(new TypeError('fetch failed'))

    await renderGroupPage('/fasilitator/galeri/kelompok/g-mine', { sessionId: 's-1', sessionName: 'Sesi Galeri' })

    expect(screen.getByText('Gagal terhubung ke server. Periksa koneksi internet Anda.')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Coba Lagi' })

    vi.mocked(participantService.getAll).mockResolvedValue(envelope([participant]))
    await act(async () => {
      fireEvent.click(retry)
    })
    expect(screen.getByText('Budi')).toBeInTheDocument()
  })
})
