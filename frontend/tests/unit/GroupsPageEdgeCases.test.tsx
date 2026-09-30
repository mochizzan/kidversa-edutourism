import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'

// ── Mocks (registered before importing the page) ──────────────────────────
vi.mock('@/core/services/sessions', () => ({
  sessionService: {
    getAll: vi.fn(),
    getById: vi.fn(),
  },
}))

vi.mock('@/core/services/live', () => ({
  liveService: {
    getGroupsWithProgress: vi.fn(),
  },
}))

vi.mock('@/core/services/programs', () => ({
  programService: {
    getStages: vi.fn(),
  },
}))

vi.mock('@/core/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Test', role: 'FASILITATOR' } }),
}))

// Import after mocks are registered
import GroupsPage from '@/features/fasilitator/pages/GroupsPage'
import { GroupCard } from '@/features/fasilitator/components/GroupCard'
import { sessionService } from '@/core/services/sessions'
import { liveService } from '@/core/services/live'
import { programService } from '@/core/services/programs'
import { SessionStatus } from '@/core/types/enums'

function envelope(data: unknown[]) {
  return { data, total: data.length, page: 1, limit: Math.max(data.length, 1), totalPages: 1 } as never
}

const activeSession = {
  id: 's-1',
  tenant_id: 't1',
  program_id: 'p1',
  name: 'Sesi Aktif 1',
  session_date: '2026-09-30',
  start_time: '08:00',
  end_time: '09:00',
  location: 'Ruang 1',
  status: SessionStatus.ACTIVE,
  created_by: 'u1',
  created_at: '2026-09-30T01:00:00Z',
  is_my_session: true,
}

const secondSession = { ...activeSession, id: 's-2', name: 'Sesi Aktif 2' }

function detailFor(session: { id: string; program_id: string }) {
  return {
    ...session,
    stages: [{ id: `ss-${session.id}`, session_id: session.id, program_stage_id: 'ps1', status: 'COMPLETED' }],
  }
}

function groupFor(sessionId: string, groupName: string) {
  return {
    group: {
      id: `g-${sessionId}`,
      session_id: sessionId,
      name: groupName,
      status: 'IN_PROGRESS',
      facilitator_id: 'u1',
      created_at: '2026-09-30T01:00:00Z',
    },
    progress: [],
    participants: [],
  }
}

const programStages = [
  {
    id: 'ps1',
    program_id: 'p1',
    sequence_order: 1,
    name: 'Topik Satu',
    content_type: 'TEXT',
    is_photo_stage: false,
  },
]

async function renderGroups(path = '/fasilitator/groups') {
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <GroupsPage />
    </MemoryRouter>,
  )
  // Flush the fetchData() chain (getAll → per-session sub-fetches)
  await act(async () => { })
  return result
}

describe('fasilitator groups page: edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(sessionService.getAll).mockResolvedValue(envelope([activeSession]))
    vi.mocked(sessionService.getById).mockImplementation(
      async (id: string) => detailFor(id === 's-2' ? secondSession : activeSession) as never,
    )
    vi.mocked(liveService.getGroupsWithProgress).mockResolvedValue(
      [groupFor('s-1', 'Kelompok A')] as never,
    )
    vi.mocked(programService.getStages).mockResolvedValue(programStages as never)
  })

  it('shows a specific not-found message for an unknown ?sessionId (not the generic empty state)', async () => {
    vi.mocked(sessionService.getAll).mockResolvedValue(envelope([activeSession]))

    await renderGroups('/fasilitator/groups?sessionId=missing-id')

    expect(screen.getByText('Sesi tidak ditemukan')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Sesi tidak ditemukan atau sudah tidak aktif. Sesi mungkin sudah berakhir atau tautan sudah kedaluwarsa.',
      ),
    ).toBeInTheDocument()
    // NOT the generic "no groups" empty state
    expect(screen.queryByText('Belum ada kelompok')).toBeNull()
    // Nothing to sub-fetch for a session that doesn't match
    expect(sessionService.getById).not.toHaveBeenCalled()
    expect(liveService.getGroupsWithProgress).not.toHaveBeenCalled()
  })

  it('shows the not-found message for a COMPLETED ?sessionId (old/stale link)', async () => {
    vi.mocked(sessionService.getAll).mockResolvedValue(
      envelope([{ ...activeSession, id: 's-old', name: 'Sesi Lama', status: SessionStatus.COMPLETED }]),
    )

    await renderGroups('/fasilitator/groups?sessionId=s-old')

    expect(screen.getByText('Sesi tidak ditemukan')).toBeInTheDocument()
    expect(screen.queryByText('Sesi Lama')).toBeNull()
    expect(screen.queryByText('Belum ada kelompok')).toBeNull()
  })

  it('renders the session and its groups normally when ?sessionId matches an active session', async () => {
    await renderGroups('/fasilitator/groups?sessionId=s-1')

    expect(screen.getByText('Sesi Aktif 1')).toBeInTheDocument()
    expect(screen.getByText('Kelompok A')).toBeInTheDocument()
    expect(screen.queryByText('Sesi tidak ditemukan')).toBeNull()
  })

  it('distinguishes "session exists but has no groups" from a missing session', async () => {
    vi.mocked(liveService.getGroupsWithProgress).mockResolvedValue([] as never)

    await renderGroups('/fasilitator/groups?sessionId=s-1')

    expect(screen.getByText('Belum ada kelompok untuk sesi ini.')).toBeInTheDocument()
    expect(screen.queryByText('Sesi tidak ditemukan')).toBeNull()
  })

  it('isolates a failed sub-fetch: inline notice + retry while other sessions still render', async () => {
    vi.mocked(sessionService.getAll).mockResolvedValue(envelope([activeSession, secondSession]))
    vi.mocked(liveService.getGroupsWithProgress).mockImplementation(async (id: string) => {
      if (id === 's-1') throw new TypeError('fetch failed')
      return [groupFor('s-2', 'Kelompok B')] as never
    })

    await renderGroups()

    // Failing session → visible inline notice + section-scoped retry
    expect(
      screen.getByText('Gagal terhubung ke server. Periksa koneksi internet Anda.'),
    ).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Coba Lagi' })

    // The rest of the page still renders
    expect(screen.getByText('Sesi Aktif 1')).toBeInTheDocument()
    expect(screen.getByText('Sesi Aktif 2')).toBeInTheDocument()
    expect(screen.getByText('Kelompok B')).toBeInTheDocument()
    expect(screen.queryByText('Kelompok A')).toBeNull()
    // Did NOT fall back to the full-page error state
    expect(screen.queryByText('Terjadi Kesalahan')).toBeNull()

    // Retrying only this session recovers it in place
    vi.mocked(liveService.getGroupsWithProgress).mockResolvedValue(
      [groupFor('s-1', 'Kelompok A')] as never,
    )
    await act(async () => {
      fireEvent.click(retry)
    })
    expect(screen.getByText('Kelompok A')).toBeInTheDocument()
    expect(screen.queryByText('Gagal terhubung ke server. Periksa koneksi internet Anda.')).toBeNull()
  })

  it('shows an inline notice (not a full-page error) when the session detail fetch fails', async () => {
    vi.mocked(sessionService.getById).mockRejectedValue(new Error('detail down'))

    await renderGroups()

    expect(screen.getByText('Sesi Aktif 1')).toBeInTheDocument()
    expect(screen.getByText('Terjadi kesalahan. Silakan coba lagi.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Coba Lagi' })).toBeInTheDocument()
    // Full-page ErrorState title must not appear — the section owns the error
    expect(screen.queryByText('Terjadi Kesalahan')).toBeNull()
  })
})

describe('fasilitator group card: edge props', () => {
  it('renders sane fallbacks for unknown status, missing name, no facilitator and zero children', () => {
    render(
      <GroupCard
        name=""
        childCount={0}
        currentStage={undefined}
        status={'WEIRD_STATUS' as never}
        facilitatorId={null as never}
        currentUserId="u1"
      />,
    )

    // No crash on an unknown status; the raw value is shown instead
    expect(screen.getByText('WEIRD_STATUS')).toBeInTheDocument()
    // Blank name → explicit fallback, not an empty heading
    expect(screen.getByText('Kelompok tanpa nama')).toBeInTheDocument()
    expect(screen.getByText('0 peserta')).toBeInTheDocument()
    expect(screen.getByText('Bukan kelompok Anda')).toBeInTheDocument()

    const card = screen.getByRole('button')
    expect(card).toBeDisabled()
    // The "Buka" open affordance only renders for the group owner
    expect(screen.queryByText('Buka', { exact: true })).toBeNull()
  })
})
