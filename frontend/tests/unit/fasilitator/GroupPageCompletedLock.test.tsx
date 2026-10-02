import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { render, screen } from '../test-utils'

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

function makeDetail(groupStatus: string) {
  return {
    id: 's-1',
    tenant_id: 't1',
    program_id: 'p1',
    name: 'Sesi Utama',
    session_date: '2026-10-01',
    location: 'Ruang 1',
    status: 'ACTIVE',
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
        status: groupStatus,
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

async function renderGroupPage(groupStatus: string) {
  vi.mocked(sessionService.getAll).mockResolvedValue({ data: [{ id: 's-1' }] } as never)
  vi.mocked(sessionService.getById).mockResolvedValue(makeDetail(groupStatus) as never)
  vi.mocked(sessionService.getSubstages).mockResolvedValue([] as never)
  vi.mocked(programService.getStages).mockResolvedValue([
    { id: 'ps1', program_id: 'p1', sequence_order: 1, name: 'Topik Satu', content_type: 'TEXT', is_photo_stage: false },
  ] as never)
  vi.mocked(assessmentService.getBySession).mockResolvedValue([] as never)
  vi.mocked(attendanceService.getBySession).mockResolvedValue([] as never)
  // Always-fetched now: GroupPage reads the group's progress rows on every
  // fetchData (per-topic completed state), not only on the fallback path.
  vi.mocked(liveService.getGroupsWithProgress).mockResolvedValue([] as never)

  const result = render(
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
  return result
}

function attendanceToggle() {
  return screen.getByRole('button', { name: 'Tidak Hadir' })
}

function assessButton() {
  return screen.getByRole('button', { name: 'Nilai' })
}

describe('GroupPage: COMPLETED group locks attendance and grading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    useToastStore.setState({ toasts: [] })
  })

  it('renders the attendance toggle and assess button DISABLED and interactions never call the APIs', async () => {
    await renderGroupPage('COMPLETED')

    const toggle = attendanceToggle()
    const assess = assessButton()
    expect(toggle).toBeDisabled()
    expect(assess).toBeDisabled()

    // Complete button is DISABLED, not hidden, on a terminal COMPLETED group.
    expect(screen.getByRole('button', { name: 'Selesaikan Kelompok' })).toBeDisabled()

    await act(async () => {
      fireEvent.click(toggle)
      fireEvent.click(assess)
    })

    expect(attendanceService.upsert).not.toHaveBeenCalled()
    expect(assessmentService.upsert).not.toHaveBeenCalled()
    // Assess stayed on the page: no navigation to the child assessment route.
    expect(screen.queryByText('child-assessment-stub')).toBeNull()
  })

  it('keeps both controls enabled on a non-completed group (toggle writes, assess navigates)', async () => {
    await renderGroupPage('IN_PROGRESS')

    const toggle = attendanceToggle()
    const assess = assessButton()
    expect(toggle).not.toBeDisabled()
    expect(assess).not.toBeDisabled()
    // No terminal server rows and a non-completed group → button stays enabled.
    expect(screen.getByRole('button', { name: 'Selesaikan Kelompok' })).toBeEnabled()

    await act(async () => {
      fireEvent.click(toggle)
    })
    expect(attendanceService.upsert).toHaveBeenCalledWith({
      participant_id: 'c-1',
      session_id: 's-1',
      session_stage_id: 'ss1',
      is_present: true,
    })

    await act(async () => {
      fireEvent.click(assess)
    })
    expect(screen.getByText('child-assessment-stub')).toBeInTheDocument()
    expect(attendanceService.upsert).toHaveBeenCalledTimes(1)
  })
})
