import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { render, screen } from '../test-utils'
import { i18n } from '@/core/i18n'

// ── Mocks (registered before importing the page) ──────────────────────────
vi.mock('@/core/services/sessions', () => ({
  sessionService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getSubstages: vi.fn(),
    getParticipantById: vi.fn(),
  },
}))

vi.mock('@/core/services/programs', () => ({
  programService: { getStages: vi.fn() },
}))

vi.mock('@/core/services/assessments', () => ({
  assessmentService: { getBySession: vi.fn(), getByParticipant: vi.fn(), upsert: vi.fn() },
}))

vi.mock('@/core/services/attendance', () => ({
  attendanceService: { getBySession: vi.fn(), upsert: vi.fn() },
}))

vi.mock('@/core/services/live', () => ({
  liveService: {
    getGroupsWithProgress: vi.fn(),
    completeStage: vi.fn(),
    addTimelineEvent: vi.fn(),
  },
}))

vi.mock('@/core/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

import GroupPage from '@/features/fasilitator/pages/GroupPage'
import { sessionService } from '@/core/services/sessions'
import { programService } from '@/core/services/programs'
import { assessmentService } from '@/core/services/assessments'
import { attendanceService } from '@/core/services/attendance'
import { liveService } from '@/core/services/live'
import { useAuth } from '@/core/hooks/useAuth'
import { useToastStore } from '@/core/stores/toastStore'

const participant = {
  id: 'c-1',
  session_id: 's-1',
  group_id: 'g-1',
  child_name: 'Budi',
  child_age: 7,
  school_name: 'SD Satu',
  parent_phone: '0812',
  consent_photo: false,
  created_at: '2026-09-30T01:00:00Z',
}

function makeDetail(sessionStatus: string) {
  return {
    id: 's-1',
    tenant_id: 't1',
    program_id: 'p1',
    name: 'Sesi Utama',
    session_date: '2026-10-01',
    location: 'Ruang 1',
    status: sessionStatus,
    created_by: 'u1',
    created_at: '2026-09-30T01:00:00Z',
    stages: [
      { id: 'ss1', session_id: 's-1', program_stage_id: 'ps1', status: 'ACTIVE', created_at: '2026-09-30T01:00:00Z' },
    ],
    groups: [
      {
        id: 'g-1',
        session_id: 's-1',
        name: 'Kelompok A',
        status: 'IN_PROGRESS',
        current_session_stage_id: 'ss1',
        facilitator_id: 'u1',
        created_at: '2026-09-30T01:00:00Z',
        participants: [participant],
      },
    ],
  }
}

async function flush() {
  for (let i = 0; i < 4; i++) {
    await act(async () => { })
  }
}

async function renderGroupPage(sessionStatus: string) {
  vi.mocked(sessionService.getAll).mockResolvedValue({ data: [{ id: 's-1' }] } as never)
  vi.mocked(sessionService.getById).mockResolvedValue(makeDetail(sessionStatus) as never)
  vi.mocked(sessionService.getSubstages).mockResolvedValue([] as never)
  vi.mocked(programService.getStages).mockResolvedValue([
    { id: 'ps1', program_id: 'p1', sequence_order: 1, name: 'Topik Satu', content_type: 'TEXT' },
  ] as never)
  vi.mocked(assessmentService.getBySession).mockResolvedValue([] as never)
  vi.mocked(attendanceService.getBySession).mockResolvedValue([] as never)
  vi.mocked(liveService.getGroupsWithProgress).mockResolvedValue([] as never)

  render(
    <MemoryRouter initialEntries={['/fasilitator/groups/g-1']}>
      <Routes>
        <Route path="/fasilitator/groups/:groupId" element={<GroupPage />} />
        <Route
          path="/fasilitator/groups/:groupId/children/:childId"
          element={<div>child-assessment-stub</div>}
        />
      </Routes>
    </MemoryRouter>,
  )
  await flush()
}

function attendanceToggle() {
  return screen.getByRole('button', { name: 'Tidak Hadir' })
}

describe('GroupPage — attendance gate on non-ACTIVE session (audit #13)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    useToastStore.setState({ toasts: [] })
  })

  it('CANCELLED session: toggle renders DISABLED with the cancelled reason banner, no API write', async () => {
    await renderGroupPage('CANCELLED')

    // The reason (alasan) is explicit for cancelled sessions.
    expect(screen.getByText(i18n.t('fasilitator.group.sessionCancelled'))).toBeInTheDocument()

    const toggle = attendanceToggle()
    expect(toggle).toBeDisabled()

    await act(async () => {
      fireEvent.click(toggle)
    })
    expect(attendanceService.upsert).not.toHaveBeenCalled()
    // Grading gate stays consistent: no live "Nilai" action either.
    expect(screen.queryByRole('button', { name: 'Nilai' })).toBeNull()
  })

  it('DRAFT session: toggle also disabled (only ACTIVE sessions are gradeable)', async () => {
    await renderGroupPage('DRAFT')
    expect(attendanceToggle()).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Nilai' })).toBeNull()
  })

  it('ACTIVE session: toggle stays enabled and writes (control case)', async () => {
    await renderGroupPage('ACTIVE')

    const toggle = attendanceToggle()
    expect(toggle).not.toBeDisabled()

    await act(async () => {
      fireEvent.click(toggle)
    })
    expect(attendanceService.upsert).toHaveBeenCalledWith({
      participant_id: 'c-1',
      session_id: 's-1',
      session_stage_id: 'ss1',
      is_present: true,
    })
  })
})
