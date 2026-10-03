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

// Budi assessed on topic ss1 only (sl1, sl2 scored) — ss2's leaf sl3 is not.
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

// Server progress rows where BOTH Kegiatan leaves of topic ss1 are terminal
// → the active topic (ss1) derives as completed. ss2's leaf has no row.
const ss1CompletedProgress = [
  { id: 'p1', group_id: 'g-1', session_substage_id: 'sl1', status: 'COMPLETED' },
  { id: 'p2', group_id: 'g-1', session_substage_id: 'sl2', status: 'COMPLETED' },
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
  opts: { withSecondTopic?: boolean; progress?: unknown[] } = {},
) {
  const { withSecondTopic = true, progress = [] } = opts
  vi.mocked(sessionService.getAll).mockResolvedValue({ data: [{ id: 's-1' }] } as never)
  vi.mocked(sessionService.getById).mockResolvedValue(makeDetail(groupStatus, withSecondTopic) as never)
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

function queryContinueButton(): HTMLElement | null {
  return screen.queryByRole('button', { name: /Lanjut ke topik berikutnya/ })
}

function terminalIndicator(): HTMLElement | null {
  return screen.queryByText('Semua topik selesai')
}

describe('GroupPage: continue to next topic / final indicator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    useToastStore.setState({ toasts: [] })
  })

  it('renders the continue control when the active topic is completed and a next topic exists, and clicking it switches the shared selection state (no refetch)', async () => {
    await renderGroupPage('IN_PROGRESS', { progress: ss1CompletedProgress })

    // Active topic ss1 completed (server rows) + next topic ss2 in stages →
    // continue control shows the next topic's name; no terminal indicator.
    const cont = screen.getByRole('button', { name: /Lanjut ke topik berikutnya/ })
    expect(cont).toHaveTextContent('Lanjut ke topik berikutnya: Topik Dua')
    expect(terminalIndicator()).toBeNull()
    // Same selection state as the dropdown before clicking.
    expect(topicSelect().value).toBe('ss1')

    // Clicking advances the ACTIVE TOPIC through the shared selection state:
    // the dropdown value and every topic-scoped derivation follow — proving
    // the continue control and the dropdown are ONE mechanism.
    const fetchCallsBefore = vi.mocked(sessionService.getById).mock.calls.length
    await act(async () => {
      fireEvent.click(cont)
    })

    // Dropdown now shows the NEXT topic…
    expect(topicSelect().value).toBe('ss2')
    // …and topic-scoped content re-derived for ss2: its leaf sl3 is unscored →
    // the assessed badge flips and the completion progress reflects ss2.
    expect(screen.getByText('Belum dinilai')).toBeInTheDocument()
    expect(screen.queryByText('Sudah dinilai')).toBeNull()
    expect(screen.getByText('0/1 sudah dinilai')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nilai Semua Peserta Terlebih Dahulu' })).toBeInTheDocument()

    // ss2 is NOT completed → neither control renders on the new topic.
    expect(queryContinueButton()).toBeNull()
    expect(terminalIndicator()).toBeNull()

    // Advancing was a pure client-side selection: NO refetch ran.
    expect(vi.mocked(sessionService.getById).mock.calls.length).toBe(fetchCallsBefore)
  })

  it('renders the terminal indicator (not the continue control) when the completed active topic is the last topic', async () => {
    await renderGroupPage('IN_PROGRESS', {
      withSecondTopic: false,
      progress: ss1CompletedProgress,
    })

    // Single topic ss1 completed → no next entry in stages → terminal state.
    expect(terminalIndicator()).toBeInTheDocument()
    expect(queryContinueButton()).toBeNull()
  })

  it('renders the terminal indicator instead of the continue control when the whole group status is COMPLETED, even with a next topic', async () => {
    // Whole group COMPLETED (no per-topic terminal rows): isTopicCompleted is
    // true via the group status, and the final condition wins over "next topic
    // exists" (ss2 is next in stages).
    await renderGroupPage('COMPLETED', { progress: [] })

    expect(terminalIndicator()).toBeInTheDocument()
    expect(queryContinueButton()).toBeNull()
    // The dropdown still shows both topics (unchanged mechanics).
    expect(topicSelect().value).toBe('ss1')
  })

  it('renders neither the continue control nor the terminal indicator while the active topic is NOT completed', async () => {
    await renderGroupPage('IN_PROGRESS', { progress: [] })

    expect(queryContinueButton()).toBeNull()
    expect(terminalIndicator()).toBeNull()
    // Dropdown still present and functional — page otherwise unchanged.
    expect(topicSelect().value).toBe('ss1')
  })
})
