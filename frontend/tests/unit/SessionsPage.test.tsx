import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent, within } from '@testing-library/react'
import { render, screen } from './test-utils'
import { i18n } from '@/core/i18n'
import { useToastStore } from '@/core/stores/toastStore'
import { friendlyError } from '@/core/utils/errorMessages'
import { ApiError } from '@/core/services/backend-client'
import { SessionStatus, GroupStatus } from '@/core/types/enums'
import type { Participant } from '@/core/types'

// ── Mocks (registered before importing the page) ──────────────────────────
vi.mock('@/core/services/sessions', () => ({
  sessionService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getSubstages: vi.fn(),
    complete: vi.fn(),
  },
}))
vi.mock('@/core/services/assessments', () => ({
  assessmentService: { getBySession: vi.fn() },
}))
vi.mock('@/core/services/attendance', () => ({
  attendanceService: { getBySession: vi.fn() },
}))

// Import after mocks are registered
import SessionsPage from '@/features/admin/pages/SessionsPage'
import { sessionService } from '@/core/services/sessions'
import { assessmentService } from '@/core/services/assessments'
import { attendanceService } from '@/core/services/attendance'

const session = {
  id: 's-1',
  tenant_id: 't-1',
  program_id: 'p-1',
  name: 'Sesi Uji',
  session_date: '2026-10-01',
  location: 'Ruang 1',
  status: SessionStatus.ACTIVE,
  created_by: 'u-1',
  created_at: '2026-10-01T00:00:00Z',
}

const participant = (id: string, childName: string) => ({
  id,
  tenant_id: 't-1',
  session_id: 's-1',
  group_id: 'g-1',
  child_name: childName,
  child_age: 8,
  parent_name: `Ortu ${childName}`,
  parent_phone: '0812000000',
  parent_email: 'ortu@example.com',
  consent_photo: false,
  created_at: '2026-10-01T00:00:00Z',
})

const present = (participantId: string) => ({
  id: `a-${participantId}`,
  participant_id: participantId,
  session_id: 's-1',
  is_present: true,
  marked_at: '2026-10-01T01:00:00Z',
  created_at: '2026-10-01T01:00:00Z',
  updated_at: '2026-10-01T01:00:00Z',
})

const absent = (participantId: string) => ({ ...present(participantId), is_present: false })

const sub1 = {
  id: 'sub-1',
  session_id: 's-1',
  session_stage_id: 'ss-1',
  program_substage_id: 'ps-1',
  status: 'ACTIVE' as const,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
}

const graded = (participantId: string) => ({
  id: `as-${participantId}`,
  participant_id: participantId,
  session_substage_id: 'sub-1',
  star_rating: 5,
  assessed_by: 'u-1',
  assessed_at: '2026-10-01T02:00:00Z',
  updated_at: '2026-10-01T02:00:00Z',
})

const detailWith = (participants: Participant[]) =>
  ({
    ...session,
    stages: [],
    groups: [
      {
        id: 'g-1',
        session_id: 's-1',
        name: 'Kelompok A',
        status: GroupStatus.IN_PROGRESS,
        facilitator_id: 'f-1',
        created_at: '2026-10-01T00:00:00Z',
        participants,
      },
    ],
  }) as never

const ungradedDialog = () =>
  screen.queryByRole('dialog', { name: i18n.t('admin.sessions.ungradedTitle') })

// ACTIVE rows render icon-only action buttons (Tooltip gives no accessible
// name): [detail, complete, cancel].
const clickComplete = () => {
  const row = screen.getByText('Sesi Uji').closest('tr') as HTMLTableRowElement
  const button = within(row).getAllByRole('button')[1]
  act(() => {
    fireEvent.click(button)
  })
}

const flush = () => act(async () => { })

describe('SessionsPage complete gate: only PRESENT participants must be graded', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToastStore.getState().dismissAll()
    vi.mocked(sessionService.getAll).mockResolvedValue({ data: [session] } as never)
    vi.mocked(sessionService.complete).mockResolvedValue(session as never)
    vi.mocked(sessionService.getSubstages).mockResolvedValue([sub1] as never)
    vi.mocked(assessmentService.getBySession).mockResolvedValue([] as never)
    vi.mocked(attendanceService.getBySession).mockResolvedValue([] as never)
  })

  const renderPage = async () => {
    render(
      <MemoryRouter>
        <SessionsPage />
      </MemoryRouter>,
    )
    await flush()
  }

  it('rejects completion when a PRESENT participant is ungraded (explicit error preserved)', async () => {
    // p-1 present but ungraded → must block; p-2 absent and ungraded → exempt.
    vi.mocked(sessionService.getById).mockResolvedValue(
      detailWith([participant('p-1', 'Budi'), participant('p-2', 'Siti')]),
    )
    vi.mocked(attendanceService.getBySession).mockResolvedValue([
      present('p-1'),
      absent('p-2'),
    ] as never)

    await renderPage()
    clickComplete()
    await flush()

    const dialog = ungradedDialog()
    expect(dialog).toBeInTheDocument()
    expect(within(dialog as HTMLElement).getByText('There are ungraded students in group Kelompok A')).toBeInTheDocument()
    expect(sessionService.complete).not.toHaveBeenCalled()
  })

  it('completes the session when every ungraded participant is absent or unmarked', async () => {
    // p-1 present and graded; p-2 explicitly absent (ungraded); p-3 no attendance
    // row at all = unmarked (ungraded). Only p-1 is checked → gate passes.
    vi.mocked(sessionService.getById).mockResolvedValue(
      detailWith([
        participant('p-1', 'Budi'),
        participant('p-2', 'Siti'),
        participant('p-3', 'Agus'),
      ]),
    )
    vi.mocked(assessmentService.getBySession).mockResolvedValue([graded('p-1')] as never)
    vi.mocked(attendanceService.getBySession).mockResolvedValue([
      present('p-1'),
      absent('p-2'),
    ] as never)

    await renderPage()
    clickComplete()
    await flush()

    expect(ungradedDialog()).toBeNull()
    expect(sessionService.complete).toHaveBeenCalledWith('s-1')
    expect(
      useToastStore.getState().toasts.some(
        (t) => t.type === 'success' && t.message === i18n.t('admin.sessions.completedToast'),
      ),
    ).toBe(true)
  })

  it('surfaces an attendance fetch failure as an error toast instead of the ungraded modal', async () => {
    vi.mocked(sessionService.getById).mockResolvedValue(
      detailWith([participant('p-1', 'Budi')]),
    )
    const failure = new ApiError('attendance down', 'internal_error', 500)
    vi.mocked(attendanceService.getBySession).mockRejectedValue(failure)

    await renderPage()
    clickComplete()
    await flush()

    expect(ungradedDialog()).toBeNull()
    expect(sessionService.complete).not.toHaveBeenCalled()
    expect(
      useToastStore.getState().toasts.some(
        (t) => t.type === 'error' && t.message === friendlyError(failure),
      ),
    ).toBe(true)
  })
})
