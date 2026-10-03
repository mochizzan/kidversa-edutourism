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

// Two topics: ss1 ("Topik Satu") with two Kegiatan leaves (sl1, sl2), ss2
// ("Topik Dua") with one Kegiatan leaf (sl3).
const substages = [
  {
    id: 'sl1', created_at: '2026-09-30T01:00:00Z', updated_at: '2026-09-30T01:00:00Z',
    session_id: 's-1', session_stage_id: 'ss1', program_substage_id: 'pg1', status: 'COMPLETED',
  },
  {
    id: 'sl2', created_at: '2026-09-30T01:01:00Z', updated_at: '2026-09-30T01:01:00Z',
    session_id: 's-1', session_stage_id: 'ss1', program_substage_id: 'pg2', status: 'COMPLETED',
  },
  {
    id: 'sl3', created_at: '2026-09-30T01:02:00Z', updated_at: '2026-09-30T01:02:00Z',
    session_id: 's-1', session_stage_id: 'ss2', program_substage_id: 'pg3', status: 'WAITING',
  },
]

const programStages = [
  { id: 'ps1', program_id: 'p1', sequence_order: 1, name: 'Topik Satu', content_type: 'TEXT' },
  { id: 'ps2', program_id: 'p1', sequence_order: 2, name: 'Topik Dua', content_type: 'TEXT' },
]

// Budi is present and fully assessed on BOTH topics, so the grading gate
// (canComplete) never disables the button in this suite — every disabled/
// enabled flip below is driven by the server progress rows (or the
// whole-group status), which is exactly what this suite pins.
const assessments = [
  {
    id: 'a1', participant_id: 'c-1', session_substage_id: 'sl1', star_rating: 3,
    assessed_by: 'u1', assessed_at: '2026-09-30T02:00:00Z', updated_at: '2026-09-30T02:00:00Z',
  },
  {
    id: 'a2', participant_id: 'c-1', session_substage_id: 'sl2', star_rating: 4,
    assessed_by: 'u1', assessed_at: '2026-09-30T02:01:00Z', updated_at: '2026-09-30T02:01:00Z',
  },
  {
    id: 'a3', participant_id: 'c-1', session_substage_id: 'sl3', star_rating: 5,
    assessed_by: 'u1', assessed_at: '2026-09-30T02:02:00Z', updated_at: '2026-09-30T02:02:00Z',
  },
]

const attendanceRows = [
  {
    id: 'at1', participant_id: 'c-1', session_id: 's-1', is_present: true,
    marked_at: '2026-09-30T01:30:00Z', created_at: '2026-09-30T01:30:00Z', updated_at: '2026-09-30T01:30:00Z',
  },
]

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
      { id: 'ss2', session_id: 's-1', program_stage_id: 'ps2', status: 'WAITING', created_at: '2026-09-30T01:01:00Z' },
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

// Server-shaped progress rows come from a FRESH fetchData on mount (what a
// page refresh runs), so asserting off this render also proves the disabled
// state persists across refreshes — it never reads local memory.
async function renderGroupPage(groupStatus: string, progress: unknown[]) {
  vi.mocked(sessionService.getAll).mockResolvedValue({ data: [{ id: 's-1' }] } as never)
  vi.mocked(sessionService.getById).mockResolvedValue(makeDetail(groupStatus) as never)
  vi.mocked(sessionService.getSubstages).mockResolvedValue(substages as never)
  vi.mocked(programService.getStages).mockResolvedValue(programStages as never)
  vi.mocked(assessmentService.getBySession).mockResolvedValue(assessments as never)
  vi.mocked(attendanceService.getBySession).mockResolvedValue(attendanceRows as never)
  vi.mocked(liveService.getGroupsWithProgress).mockResolvedValue(
    [{ group: { id: 'g-1' }, progress, participants: [participant] }] as never,
  )

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

function topicSelect(): HTMLSelectElement {
  return screen.getByRole('combobox', { name: 'Pilih topik' }) as HTMLSelectElement
}

function completeButton() {
  return screen.getByRole('button', { name: 'Selesaikan Kelompok' })
}

describe('GroupPage: Complete button disabled state (server progress rows)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    useToastStore.setState({ toasts: [] })
  })

  it('disables the button when the ACTIVE topic leaves are terminal per server rows (group still IN_PROGRESS), per topic', async () => {
    // Topic ss1 (initial selection) fully terminal; topic ss2 not. The group
    // itself is NOT completed — only the rows drive the state.
    await renderGroupPage('IN_PROGRESS', [
      { id: 'p1', group_id: 'g-1', session_substage_id: 'sl1', status: 'COMPLETED' },
      { id: 'p2', group_id: 'g-1', session_substage_id: 'sl2', status: 'COMPLETED' },
      { id: 'p3', group_id: 'g-1', session_substage_id: 'sl3', status: 'LOCKED' },
    ])

    // Fresh render from server data → disabled (refresh persistence falls out
    // of this: the rows come from fetchData, not component memory).
    expect(completeButton()).toBeDisabled()

    // Switching to the NOT-completed topic ss2 re-derives → enabled.
    await act(async () => {
      fireEvent.change(topicSelect(), { target: { value: 'ss2' } })
    })
    expect(topicSelect().value).toBe('ss2')
    expect(completeButton()).toBeEnabled()

    // Back to the completed topic ss1 → disabled again.
    await act(async () => {
      fireEvent.change(topicSelect(), { target: { value: 'ss1' } })
    })
    expect(completeButton()).toBeDisabled()
  })

  it('keeps the button enabled when the active topic has no terminal server rows (non-completed group)', async () => {
    await renderGroupPage('IN_PROGRESS', [
      { id: 'p1', group_id: 'g-1', session_substage_id: 'sl1', status: 'LOCKED' },
      { id: 'p2', group_id: 'g-1', session_substage_id: 'sl2', status: 'LOCKED' },
      { id: 'p3', group_id: 'g-1', session_substage_id: 'sl3', status: 'LOCKED' },
    ])

    expect(completeButton()).toBeEnabled()
  })

  it('keeps the button enabled when the server rows are entirely missing (missing rows = not completed)', async () => {
    await renderGroupPage('IN_PROGRESS', [])

    expect(completeButton()).toBeEnabled()
  })

  it('renders the button DISABLED (not hidden) when the whole group is COMPLETED, even with non-terminal rows', async () => {
    await renderGroupPage('COMPLETED', [
      { id: 'p1', group_id: 'g-1', session_substage_id: 'sl1', status: 'LOCKED' },
      { id: 'p2', group_id: 'g-1', session_substage_id: 'sl2', status: 'LOCKED' },
      { id: 'p3', group_id: 'g-1', session_substage_id: 'sl3', status: 'LOCKED' },
    ])

    // Present in the DOM (the old behaviour hid it)…
    expect(completeButton()).toBeInTheDocument()
    // …but terminal: disabled via the whole-group lock.
    expect(completeButton()).toBeDisabled()
  })
})
