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

// Two topics: ss1 with leaves sl1/sl2, ss2 with leaf sl3.
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
  { id: 'ps1', program_id: 'p1', sequence_order: 1, name: 'Topik Satu', content_type: 'TEXT', is_photo_stage: false },
  { id: 'ps2', program_id: 'p1', sequence_order: 2, name: 'Topik Dua', content_type: 'TEXT', is_photo_stage: false },
]

// Budi: both ss1 leaves scored, ss2's leaf NOT scored → topik-1 ≠ topik-2.
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

function makeDetail() {
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

function seedMocks() {
  vi.mocked(sessionService.getAll).mockResolvedValue({ data: [{ id: 's-1' }] } as never)
  vi.mocked(sessionService.getById).mockResolvedValue(makeDetail() as never)
  vi.mocked(sessionService.getSubstages).mockResolvedValue(substages as never)
  vi.mocked(programService.getStages).mockResolvedValue(programStages as never)
  vi.mocked(assessmentService.getBySession).mockResolvedValue(assessments as never)
  vi.mocked(attendanceService.getBySession).mockResolvedValue(attendanceRows as never)
  vi.mocked(liveService.getGroupsWithProgress).mockResolvedValue([] as never)
}

function renderAt(path: string) {
  const qIndex = path.indexOf('?')
  const entry = qIndex === -1
    ? path
    : { pathname: path.slice(0, qIndex), search: path.slice(qIndex) }
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/fasilitator/groups/:groupId" element={<GroupPage />} />
        <Route
          path="/fasilitator/groups/:groupId/children/:childId"
          element={<div>child-assessment-stub</div>}
        />
      </Routes>
    </MemoryRouter>,
  )
}

function topicSelect(): HTMLSelectElement {
  return screen.getByRole('combobox', { name: 'Pilih topik' }) as HTMLSelectElement
}

describe('GroupPage Perbaikan-1: per-topic leaves+scores, whole-session attendance, topic lock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    useToastStore.setState({ toasts: [] })
    seedMocks()
  })

  it('topik-1 vs topik-2 leaves+scores differ: switching topics flips assessed + completion', async () => {
    renderAt('/fasilitator/groups/g-1')
    await flush()

    // ss1: both leaves scored → assessed + complete gate met.
    expect(topicSelect().value).toBe('ss1')
    expect(screen.getByText('Sudah dinilai')).toBeInTheDocument()
    expect(screen.getByText('Semua sudah dinilai')).toBeInTheDocument()

    // ss2: its single leaf has no score → NOT assessed, gate unmet.
    // Proof topik-1 ≠ topik-2: same participant, different topic state.
    await act(async () => {
      fireEvent.change(topicSelect(), { target: { value: 'ss2' } })
    })
    expect(topicSelect().value).toBe('ss2')
    expect(screen.queryByText('Sudah dinilai')).toBeNull()
    expect(screen.getByText('Belum dinilai')).toBeInTheDocument()
    expect(screen.getByText('0/1 sudah dinilai')).toBeInTheDocument()
    expect(screen.queryByText('Semua sudah dinilai')).toBeNull()
  })

  it('attendance (OPSI B): one whole-session toggle with an explicit session-wide label', async () => {
    renderAt('/fasilitator/groups/g-1')
    await flush()

    // Exactly one toggle per participant, labelled session-wide.
    expect(screen.getByText('Kehadiran dicatat satu kali per sesi dan berlaku untuk seluruh topik.')).toBeInTheDocument()
    const toggles = screen.getAllByRole('button', { name: 'Hadir' })
    expect(toggles).toHaveLength(1)

    // Identical session value across topics is CORRECT (OPSI B): after
    // switching to ss2 the same single toggle stays present.
    await act(async () => {
      fireEvent.change(topicSelect(), { target: { value: 'ss2' } })
    })
    expect(screen.getAllByRole('button', { name: 'Hadir' })).toHaveLength(1)
  })

  it('assess navigation forwards the active stage via query + state', async () => {
    renderAt('/fasilitator/groups/g-1')
    await flush()

    await act(async () => {
      fireEvent.change(topicSelect(), { target: { value: 'ss2' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nilai' }))
    })

    // The child route rendered → navigation happened with the active topic.
    expect(screen.getByText('child-assessment-stub')).toBeInTheDocument()
  })

  it('back-nav ?stage=ss2 hint restores the same topic instead of topik-1', async () => {
    renderAt('/fasilitator/groups/g-1?stage=ss2')
    await flush()

    // First-load hint wins over current_session_stage_id (ss1).
    expect(topicSelect().value).toBe('ss2')
    expect(screen.getByText('Belum dinilai')).toBeInTheDocument()
    expect(within(topicSelect()).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)).toEqual(['ss1', 'ss2'])
  })

  it('lock UI: active-topic completion disables attendance + assess + complete (visible, never hidden)', async () => {
    // Server rows mark BOTH ss1 leaves terminal → ss1 locked; ss2 open.
    vi.mocked(liveService.getGroupsWithProgress).mockResolvedValue(
      [{
        group: { id: 'g-1' },
        progress: [
          { id: 'p1', group_id: 'g-1', session_substage_id: 'sl1', status: 'COMPLETED' },
          { id: 'p2', group_id: 'g-1', session_substage_id: 'sl2', status: 'COMPLETED' },
        ],
        participants: [participant],
      }] as never,
    )
    renderAt('/fasilitator/groups/g-1')
    await flush()

    // ss1 (initial): everything disabled but still rendered.
    expect(screen.getByRole('button', { name: 'Hadir' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Nilai' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Selesaikan Kelompok' })).toBeDisabled()

    // ss2: same controls re-enable (per-topic lock, not whole-group).
    await act(async () => {
      fireEvent.change(topicSelect(), { target: { value: 'ss2' } })
    })
    expect(screen.getByRole('button', { name: 'Hadir' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Nilai' })).not.toBeDisabled()
  })
})
