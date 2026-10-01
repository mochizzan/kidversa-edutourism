import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent, within } from '@testing-library/react'
import { render, screen } from './test-utils'

const navigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('@/core/services/sessions', () => ({
  sessionService: { getAll: vi.fn(), getById: vi.fn(), getGroups: vi.fn() },
}))
vi.mock('@/core/services/live', () => ({
  liveService: { getGroupsWithProgress: vi.fn() },
}))
vi.mock('@/core/services/programs', () => ({
  programService: { getStages: vi.fn() },
}))
const mockUser = { id: 'u1', name: 'Fasil Satu', role: 'FASILITATOR' }

vi.mock('@/core/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}))

import GroupsPage from '@/features/fasilitator/pages/GroupsPage'
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

// Server-flagged ownership (GET /api/live/:sessionId/groups → is_owner).
// is_owner sits on the wrapper next to group/progress/participants, matching
// the backend liveGroupItem shape — NOT inside group.
function ownedGroup() {
  return {
    group: {
      id: 'g-mine',
      session_id: 's-1',
      name: 'Kelompok Milik Saya',
      status: 'IN_PROGRESS',
      facilitator_id: 'u1',
      created_at: '2026-09-30T01:00:00Z',
    },
    progress: [],
    participants: [],
    is_owner: true,
  }
}

function foreignGroup() {
  return {
    group: {
      id: 'g-other',
      session_id: 's-1',
      name: 'Kelompok Orang Lain',
      status: 'WAITING',
      facilitator_id: 'u2',
      created_at: '2026-09-30T01:00:00Z',
    },
    progress: [],
    participants: [],
    is_owner: false,
  }
}

async function renderGroups() {
  const result = render(
    <MemoryRouter initialEntries={['/fasilitator/groups?sessionId=s-1']}>
      <GroupsPage />
    </MemoryRouter>,
  )
  // Flush the fetchData() chain (getAll → per-session sub-fetches)
  await act(async () => { })
  return result
}

function cardFor(name: string): HTMLElement {
  const button = screen.getByRole('button', { name: new RegExp(name) })
  return button
}

describe('fasilitator groups page: cross-facilitator visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigate.mockReset()
    mockUser.id = 'u1'
    mockUser.role = 'FASILITATOR'
    vi.mocked(sessionService.getAll).mockResolvedValue(envelope([activeSession]))
    vi.mocked(sessionService.getById).mockResolvedValue({
      ...activeSession,
      stages: [
        { id: 'ss-1', session_id: 's-1', program_stage_id: 'ps1', status: 'COMPLETED' },
      ],
    } as never)
    vi.mocked(liveService.getGroupsWithProgress).mockResolvedValue(
      [ownedGroup(), foreignGroup()] as never,
    )
    vi.mocked(programService.getStages).mockResolvedValue(programStages as never)
  })

  it('renders ALL groups of the session, owned and not owned', async () => {
    await renderGroups()

    expect(screen.getByText('Kelompok Milik Saya')).toBeInTheDocument()
    expect(screen.getByText('Kelompok Orang Lain')).toBeInTheDocument()
  })

  it('badges the owner card "Kelompok Anda" and gives the non-owner no ownership badge', async () => {
    await renderGroups()

    const ownerCard = cardFor('Kelompok Milik Saya')
    const foreignCard = cardFor('Kelompok Orang Lain')

    expect(within(ownerCard).getByText('Kelompok Anda')).toBeInTheDocument()
    // Non-owner: no "Kelompok Anda" badge (the explanatory lock hint stays)
    expect(within(foreignCard).queryByText('Kelompok Anda')).toBeNull()
    expect(within(foreignCard).getByText('Bukan kelompok Anda')).toBeInTheDocument()
  })

  it('opens an explanatory modal (no navigation) when a non-owner card is clicked', async () => {
    await renderGroups()

    fireEvent.click(cardFor('Kelompok Orang Lain'))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('Bukan kelompok Anda')).toBeInTheDocument()
    expect(
      within(dialog).getByText('Hanya fasilitator kelompok ini yang dapat membuka galeri pesertanya.'),
    ).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('navigates when the owner card is clicked', async () => {
    await renderGroups()

    fireEvent.click(cardFor('Kelompok Milik Saya'))

    expect(navigate).toHaveBeenCalledWith('/fasilitator/groups/g-mine')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('consumes the server is_owner flag: admin enters groups not matching their user id', async () => {
    // Divergence case — the client fallback (facilitator_id === user.id) would
    // say "not mine" for both cards (admin id 'a1'), but the server flagged
    // them is_owner: true. Only reading item.is_owner makes them enterable.
    mockUser.id = 'a1'
    mockUser.role = 'ADMIN'
    const adminOwnedMine = { ...ownedGroup(), is_owner: true }
    const adminOwnedForeign = { ...foreignGroup(), is_owner: true }
    vi.mocked(liveService.getGroupsWithProgress).mockResolvedValue(
      [adminOwnedMine, adminOwnedForeign] as never,
    )

    await renderGroups()

    const ownerCard = cardFor('Kelompok Milik Saya')
    const foreignCard = cardFor('Kelompok Orang Lain')

    expect(within(ownerCard).getByText('Kelompok Anda')).toBeInTheDocument()
    expect(within(foreignCard).getByText('Kelompok Anda')).toBeInTheDocument()
    expect(screen.queryByText('Bukan kelompok Anda')).toBeNull()

    fireEvent.click(foreignCard)
    expect(navigate).toHaveBeenCalledWith('/fasilitator/groups/g-other')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
