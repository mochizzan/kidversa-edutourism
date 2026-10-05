import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'
import { i18n } from '@/core/i18n'

vi.mock('@/core/services/participants', () => ({
  participantService: { getAll: vi.fn() },
}))

vi.mock('@/core/services/sessions', () => ({
  sessionService: {
    getAll: vi.fn(),
    getLinkableParticipants: vi.fn(),
    linkParticipant: vi.fn(),
    importParticipants: vi.fn(),
  },
}))

// Import AFTER mocks are registered
import { SessionGroupsTab } from '@/features/admin/components/SessionGroupsTab'
import { participantService } from '@/core/services/participants'
import { sessionService } from '@/core/services/sessions'

const groups = [
  {
    id: 'g-a',
    name: 'Kelompok Alpha',
    session_id: 's-1',
    color_code: '#FF0000',
    facilitator_id: null,
    participants: [],
  },
] as never[]

const linkableFromCancelled = [
  {
    participant: {
      id: 'p-9',
      session_id: 's-cancel',
      group_id: 'g-x',
      child_name: 'Anak Baru',
      child_age: 7,
      school_name: 'SD Beta',
      parent_name: 'Budi',
      parent_phone: '+628123456789',
    },
    session_name: 'Sesi Batal Lama',
    session_id: 's-cancel',
    program_id: 'p1',
  },
]

const flush = () => act(async () => { })

async function renderTab() {
  render(
    <MemoryRouter>
      <SessionGroupsTab
        sessionId="s-1"
        sessionStatus="ACTIVE"
        groups={groups}
        facilitators={[]}
        onRefresh={vi.fn()}
      />
    </MemoryRouter>,
  )
  await flush()
  fireEvent.click(screen.getAllByText('Tambah Peserta')[0])
  await flush()
}

describe('SessionGroupsTab — migration dialog warns on CANCELLED source session (audit #8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(participantService.getAll).mockResolvedValue({
      data: [
        {
          id: 'p-9',
          child_name: 'Anak Baru',
          child_age: 7,
          school_name: 'SD Beta',
          parent_name: 'Budi',
          parent_phone: '+628123456789',
        },
      ],
      total: 1,
    } as never)
    vi.mocked(sessionService.getLinkableParticipants).mockResolvedValue(linkableFromCancelled as never)
    vi.mocked(sessionService.linkParticipant).mockResolvedValue(undefined as never)
  })

  it('shows the explicit copy warning when the source session is CANCELLED — migration still allowed', async () => {
    vi.mocked(sessionService.getAll).mockResolvedValue({
      data: [{ id: 's-cancel', status: 'CANCELLED' }],
      total: 1,
      page: 1,
      limit: 1,
      totalPages: 1,
    } as never)

    await renderTab()
    // Participant from another session → migrate confirm dialog opens.
    fireEvent.click(screen.getByText('Anak Baru'))
    await flush()

    const warning = screen.getByRole('alert')
    expect(warning.textContent).toContain(i18n.t('admin.participants.migrateCancelledWarning'))
    // Not rejected: the confirm button stays available (backend allows it).
    expect(screen.getByRole('button', { name: i18n.t('admin.participants.migrateBtn') })).toBeEnabled()
    // Context line still explains the migration.
    expect(screen.getByText(i18n.t('admin.participants.migrateQuestion'))).toBeInTheDocument()
  })

  it('shows NO warning when the source session is not cancelled', async () => {
    vi.mocked(sessionService.getAll).mockResolvedValue({
      data: [{ id: 's-cancel', status: 'ACTIVE' }],
      total: 1,
      page: 1,
      limit: 1,
      totalPages: 1,
    } as never)

    await renderTab()
    fireEvent.click(screen.getByText('Anak Baru'))
    await flush()

    expect(screen.queryByText(i18n.t('admin.participants.migrateCancelledWarning'))).toBeNull()
    expect(screen.getByRole('button', { name: i18n.t('admin.participants.migrateBtn') })).toBeEnabled()
  })
})
