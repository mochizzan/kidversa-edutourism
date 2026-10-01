import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'

// ── Mocks (registered before importing the component) ─────────────────────

// Capture the wire requests without touching the network. The real
// sessionService runs on top of these, so the PUT body built by
// sessions.ts ({name, facilitator_id}) is observable per group.
vi.mock('@/core/services/api-envelope', () => ({
  normalizeTenantId: vi.fn((item: unknown) => item),
  fetchAllPages: vi.fn(async () => []),
  listRequest: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
  arrayRequest: vi.fn(async () => []),
  itemsRequest: vi.fn(async () => []),
  itemsWithExtrasRequest: vi.fn(async () => ({ items: [], extras: {} })),
  itemRequest: vi.fn(async () => ({})),
  nullableItemRequest: vi.fn(async () => null),
  voidRequest: vi.fn(async () => undefined),
}))

import type * as SessionsModule from '@/core/services/sessions'

vi.mock('@/core/services/sessions', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionsModule>()
  return {
    sessionService: {
      ...actual.sessionService,
      // Spy that still runs the real implementation, so both the component
      // call (facilitatorId) and the HTTP body (facilitator_id) are asserted.
      updateGroup: vi.fn(actual.sessionService.updateGroup),
    },
  }
})

// Import after mocks are registered
import { SessionGroupsTab } from '@/features/admin/components/SessionGroupsTab'
import { sessionService } from '@/core/services/sessions'
import { itemRequest } from '@/core/services/api-envelope'
import { API_ROUTES } from '@/core/constants/apiRoutes'
import { GroupStatus } from '@/core/types/enums'
import type { SessionGroup, Participant, User } from '@/core/types'

type GroupFixture = SessionGroup & { participants: Participant[] }

const facilitators = [
  { id: 'f-1', name: 'Budi' },
  { id: 'f-2', name: 'Siti' },
] as unknown as User[]

const groups: GroupFixture[] = [
  { id: 'g-a', session_id: 's-1', name: 'Kelompok Alpha', status: GroupStatus.WAITING, created_at: '2026-09-30T01:00:00Z', participants: [] },
  { id: 'g-b', session_id: 's-1', name: 'Kelompok Beta', status: GroupStatus.WAITING, created_at: '2026-09-30T01:00:00Z', participants: [] },
]

const onRefresh = vi.fn()

async function renderTab(sessionStatus: string, groupList: GroupFixture[] = groups) {
  render(
    <MemoryRouter>
      <SessionGroupsTab
        sessionId="s-1"
        sessionStatus={sessionStatus}
        groups={groupList}
        facilitators={facilitators}
        onRefresh={onRefresh}
      />
    </MemoryRouter>,
  )
  // Flush mount effects (linkable-participants load)
  await act(async () => { })
}

describe('SessionGroupsTab: per-group facilitator assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a facilitator select for every group when the session is ACTIVE', async () => {
    await renderTab('ACTIVE')

    expect(screen.getByRole('combobox', { name: 'Fasilitator kelompok Kelompok Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Fasilitator kelompok Kelompok Beta' })).toBeInTheDocument()
    // Group management controls stay DRAFT-only while assignment opens up.
    expect(screen.queryByRole('button', { name: 'Tambah Kelompok' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Import CSV' })).toBeNull()
  })

  it("sends a per-group PUT carrying that group's own facilitator_id", async () => {
    await renderTab('ACTIVE')

    const selectA = screen.getByRole('combobox', { name: 'Fasilitator kelompok Kelompok Alpha' })
    const selectB = screen.getByRole('combobox', { name: 'Fasilitator kelompok Kelompok Beta' })

    await act(async () => { fireEvent.change(selectA, { target: { value: 'f-1' } }) })
    await act(async () => { fireEvent.change(selectB, { target: { value: 'f-2' } }) })

    // Component call: each group gets its own facilitator, not a shared one.
    expect(sessionService.updateGroup).toHaveBeenCalledWith('s-1', 'g-a', { name: 'Kelompok Alpha', facilitatorId: 'f-1' })
    expect(sessionService.updateGroup).toHaveBeenCalledWith('s-1', 'g-b', { name: 'Kelompok Beta', facilitatorId: 'f-2' })

    // Wire body: sessions.ts maps facilitatorId → facilitator_id per group.
    const putCalls = vi.mocked(itemRequest).mock.calls.filter((call: unknown[]) => call[0] === 'PUT')
    expect(putCalls).toContainEqual(['PUT', API_ROUTES.SESSIONS.GROUP_DETAIL('s-1', 'g-a'), { name: 'Kelompok Alpha', facilitator_id: 'f-1' }])
    expect(putCalls).toContainEqual(['PUT', API_ROUTES.SESSIONS.GROUP_DETAIL('s-1', 'g-b'), { name: 'Kelompok Beta', facilitator_id: 'f-2' }])
    expect(onRefresh).toHaveBeenCalled()
  })

  it('keeps the facilitator read-only when the session is COMPLETED', async () => {
    const completedGroups: GroupFixture[] = [
      { ...groups[0], facilitator_id: 'f-1', status: GroupStatus.COMPLETED },
    ]
    await renderTab('COMPLETED', completedGroups)

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Budi')).toBeInTheDocument()
  })
})
