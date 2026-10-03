import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { fireEvent, within } from '@testing-library/react'
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

// Two topics: ss1 ("Topik Satu") with two Kegiatan leaves, ss2 ("Topik Dua")
// with one Kegiatan leaf.
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

// Budi is fully assessed on topic ss1 (both leaves scored) but NOT on topic
// ss2 (its single leaf has no assessment).
const assessments = [
  {
    id: 'a1', participant_id: 'c-1', session_substage_id: 'sl1', star_rating: 3,
    assessed_by: 'u1', assessed_at: '2026-09-30T02:00:00Z', updated_at: '2026-09-30T02:00:00Z',
  },
  {
    id: 'a2', participant_id: 'c-1', session_substage_id: 'sl2', star_rating: 4,
    assessed_by: 'u1', assessed_at: '2026-09-30T02:01:00Z', updated_at: '2026-09-30T02:01:00Z',
  },
]

const attendanceRows = [
  {
    id: 'at1', participant_id: 'c-1', session_id: 's-1', is_present: true,
    marked_at: '2026-09-30T01:30:00Z', created_at: '2026-09-30T01:30:00Z', updated_at: '2026-09-30T01:30:00Z',
  },
]

function makeDetail(groupStatus: string, withSecondTopic = true) {
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
    stages: withSecondTopic
      ? [
        { id: 'ss1', session_id: 's-1', program_stage_id: 'ps1', status: 'ACTIVE', created_at: '2026-09-30T01:00:00Z' },
        { id: 'ss2', session_id: 's-1', program_stage_id: 'ps2', status: 'WAITING', created_at: '2026-09-30T01:01:00Z' },
      ]
      : [
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

async function renderGroupPage(
  groupStatus: string,
  opts: { withSecondTopic?: boolean; attendance?: typeof attendanceRows } = {},
) {
  const { withSecondTopic = true, attendance = attendanceRows } = opts
  vi.mocked(sessionService.getAll).mockResolvedValue({ data: [{ id: 's-1' }] } as never)
  vi.mocked(sessionService.getById).mockResolvedValue(makeDetail(groupStatus, withSecondTopic) as never)
  vi.mocked(sessionService.getSubstages).mockResolvedValue(substages as never)
  vi.mocked(programService.getStages).mockResolvedValue(programStages as never)
  vi.mocked(assessmentService.getBySession).mockResolvedValue(assessments as never)
  vi.mocked(attendanceService.getBySession).mockResolvedValue(attendance as never)
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

function topicSelect(): HTMLSelectElement {
  return screen.getByRole('combobox', { name: 'Pilih topik' }) as HTMLSelectElement
}

describe('GroupPage: topic dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    useToastStore.setState({ toasts: [] })
  })

  it('renders a topic selector with one option per topic and loads the selected topic\'s data', async () => {
    await renderGroupPage('IN_PROGRESS')

    // Dropdown replaces the plain-text topic name when topics > 1.
    const select = topicSelect()
    const options = within(select).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Topik Satu', 'Topik Dua'])
    // Current topic (resolved from group.current_session_stage_id) selected.
    expect(select.value).toBe('ss1')

    // Topic ss1 context: Budi present + both ss1 leaves scored → assessed,
    // and the completion progress reflects the ss1 leaf set.
    expect(screen.getByText('Sudah dinilai')).toBeInTheDocument()
    expect(screen.getByText('Semua sudah dinilai')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Selesaikan Kelompok' })).toBeEnabled()

    // Switch to topic ss2 → every stage-keyed derivation re-runs.
    await act(async () => {
      fireEvent.change(select, { target: { value: 'ss2' } })
    })

    expect(topicSelect().value).toBe('ss2')
    // ss2's single leaf is NOT scored → the assessed badge flips.
    expect(screen.queryByText('Sudah dinilai')).toBeNull()
    expect(screen.getByText('Belum dinilai')).toBeInTheDocument()
    // Completion now reflects ss2's leaf set (0 of 1 present assessed).
    expect(screen.getByText('0/1 sudah dinilai')).toBeInTheDocument()
    expect(screen.queryByText('Semua sudah dinilai')).toBeNull()
    expect(screen.getByRole('button', { name: 'Nilai Semua Peserta Terlebih Dahulu' })).toBeInTheDocument()
  })

  it('shows the topic as plain text (no dropdown) when the session has exactly one topic', async () => {
    await renderGroupPage('IN_PROGRESS', { withSecondTopic: false })

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Topik Satu')).toBeInTheDocument()
  })

  it('keeps the COMPLETED lock invariants with the dropdown present', async () => {
    // Same mocking approach as GroupPageCompletedLock: no attendance/assessment
    // rows written this run — controls render but stay locked.
    await renderGroupPage('COMPLETED', { attendance: [] })

    // Dropdown still renders for a completed group…
    const select = topicSelect()
    expect(within(select).getAllByRole('option')).toHaveLength(2)

    // …but attendance/assessment stay locked.
    const toggle = screen.getByRole('button', { name: 'Tidak Hadir' })
    const assess = screen.getByRole('button', { name: 'Nilai' })
    expect(toggle).toBeDisabled()
    expect(assess).toBeDisabled()

    await act(async () => {
      fireEvent.click(toggle)
      fireEvent.click(assess)
    })

    expect(attendanceService.upsert).not.toHaveBeenCalled()
    expect(screen.queryByText('child-assessment-stub')).toBeNull()
  })
})
