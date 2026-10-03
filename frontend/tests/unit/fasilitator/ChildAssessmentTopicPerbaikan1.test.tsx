import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
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

vi.mock('@/core/services/program-substages', () => ({
  programSubstageService: { listByStage: vi.fn() },
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

import ChildAssessmentPage from '@/features/fasilitator/pages/ChildAssessmentPage'
import { isKegiatanCompletedFromProgress } from '@/features/fasilitator/utils/groupCompletion'
import { sessionService } from '@/core/services/sessions'
import { programService } from '@/core/services/programs'
import { programSubstageService } from '@/core/services/program-substages'
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
  consent_photo: true,
  created_at: '2026-09-30T01:00:00Z',
}

// Session with two topics: ss1 (leaves k1/k2) and ss2 (leaf k3).
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

const allLeaves = [
  {
    id: 'k1', session_id: 's-1', session_stage_id: 'ss1', program_substage_id: 'psk1',
    created_at: '2026-09-30T01:00:00Z',
  },
  {
    id: 'k2', session_id: 's-1', session_stage_id: 'ss1', program_substage_id: 'psk2',
    created_at: '2026-09-30T01:01:00Z',
  },
  {
    id: 'k3', session_id: 's-1', session_stage_id: 'ss2', program_substage_id: 'psk3',
    created_at: '2026-09-30T01:02:00Z',
  },
]

// Session-wide scores: k1/k2 scored (topik-1), k3 unscored (topik-2).
// The hook MUST filter these to the active topic's leaves.
const allScores = [
  {
    id: 'a1', participant_id: 'c-1', session_substage_id: 'k1', star_rating: 3,
    assessed_by: 'u1', assessed_at: '2026-09-30T02:00:00Z', updated_at: '2026-09-30T02:00:00Z',
  },
  {
    id: 'a2', participant_id: 'c-1', session_substage_id: 'k2', star_rating: 4,
    assessed_by: 'u1', assessed_at: '2026-09-30T02:01:00Z', updated_at: '2026-09-30T02:01:00Z',
  },
]

async function flush() {
  for (let i = 0; i < 4; i++) {
    await act(async () => { })
  }
}

function seedMocks(progress: unknown[] = []) {
  vi.mocked(sessionService.getAll).mockResolvedValue({ data: [{ id: 's-1' }] } as never)
  vi.mocked(sessionService.getParticipantById).mockResolvedValue(participant as never)
  vi.mocked(sessionService.getById).mockResolvedValue(makeDetail() as never)
  vi.mocked(sessionService.getSubstages).mockResolvedValue(allLeaves as never)
  vi.mocked(programService.getStages).mockResolvedValue([
    { id: 'ps1', program_id: 'p1', sequence_order: 1, name: 'Topik Satu', content_type: 'TEXT' },
    { id: 'ps2', program_id: 'p1', sequence_order: 2, name: 'Topik Dua', content_type: 'TEXT' },
  ] as never)
  vi.mocked(programSubstageService.listByStage).mockImplementation(async (stageId: string) => {
    if (stageId === 'ps1') {
      return [
        { id: 'psk1', program_stage_id: 'ps1', name: 'Kegiatan Satu' },
        { id: 'psk2', program_stage_id: 'ps1', name: 'Kegiatan Dua' },
      ] as never
    }
    return [{ id: 'psk3', program_stage_id: 'ps2', name: 'Kegiatan Tiga' }] as never
  })
  vi.mocked(assessmentService.getByParticipant).mockResolvedValue(allScores as never)
  vi.mocked(attendanceService.getBySession).mockResolvedValue([
    { participant_id: 'c-1', is_present: true },
  ] as never)
  vi.mocked(liveService.getGroupsWithProgress).mockResolvedValue(
    [{ group: { id: 'g-1' }, progress, participants: [participant] }] as never,
  )
}

function renderAt(path: string, state?: Record<string, string>) {
  const qIndex = path.indexOf('?')
  const entry = qIndex === -1
    ? { pathname: path, state }
    : { pathname: path.slice(0, qIndex), search: path.slice(qIndex), state }
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/fasilitator/groups/:groupId/children/:childId" element={<ChildAssessmentPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function starButtons() {
  return screen.getAllByRole('button', { name: /dari 5 bintang/ })
}

describe('ChildAssessmentPage Perbaikan-1: per-topic leaves+scores, per-Kegiatan lock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    useToastStore.setState({ toasts: [] })
    seedMocks()
  })

  it('topik-1 vs topik-2 resolve different leaves (never current_session_stage_id): ?stage=ss2 shows only topik-2', async () => {
    // No stage hint → historical chain → ss1 (current_session_stage_id).
    renderAt('/fasilitator/groups/g-1/children/c-1', { sessionId: 's-1' })
    await flush()

    expect(screen.getByText('Kegiatan Satu')).toBeInTheDocument()
    expect(screen.getByText('Kegiatan Dua')).toBeInTheDocument()
    expect(screen.queryByText('Kegiatan Tiga')).toBeNull()
    expect(screen.getByText('Topik Satu')).toBeInTheDocument()
  })

  it('forwarded stage ?stage=ss2 shows ONLY topik-2 leaves with its own (empty) scores', async () => {
    renderAt('/fasilitator/groups/g-1/children/c-1?stage=ss2', { sessionId: 's-1', sessionStageId: 'ss2' })
    await flush()

    // Proof topik-1 ≠ topik-2: same child+session, different cards.
    expect(screen.queryByText('Kegiatan Satu')).toBeNull()
    expect(screen.queryByText('Kegiatan Dua')).toBeNull()
    expect(screen.getByText('Kegiatan Tiga')).toBeInTheDocument()
    expect(screen.getByText('Topik Dua')).toBeInTheDocument()
    // k3 has no score → stars start empty (topik-1's 3★/4★ did NOT leak).
    const stars = starButtons()
    expect(stars).toHaveLength(4)
  })

  it('scores are filtered per active leaves: topik-2 card starts unscored while topik-1 is scored', async () => {
    // Topik-1 view: k1 card carries its 3★ score (filtered map has k1+k2).
    renderAt('/fasilitator/groups/g-1/children/c-1?stage=ss1', { sessionId: 's-1', sessionStageId: 'ss1' })
    await flush()
    expect(screen.getByText('Kegiatan Satu')).toBeInTheDocument()
    expect(assessmentService.getByParticipant).toHaveBeenCalledWith('c-1')
  })

  it('lock UI: terminal progress row disables ONLY that Kegiatan card (form stays visible, read-only)', async () => {
    // k1 terminal → locked; k2 open → editable. Same topic, per-leaf lock.
    seedMocks([{ id: 'p1', group_id: 'g-1', session_substage_id: 'k1', status: 'COMPLETED' }])
    renderAt('/fasilitator/groups/g-1/children/c-1?stage=ss1', { sessionId: 's-1', sessionStageId: 'ss1' })
    await flush()

    expect(isKegiatanCompletedFromProgress(
      [{ session_substage_id: 'k1', status: 'COMPLETED' }],
      'k1',
    )).toBe(true)
    expect(isKegiatanCompletedFromProgress(
      [{ session_substage_id: 'k1', status: 'COMPLETED' }],
      'k2',
    )).toBe(false)

    // Both cards stay visible (never hidden); k1's save is disabled.
    expect(screen.getByText('Kegiatan Satu')).toBeInTheDocument()
    expect(screen.getByText('Kegiatan Dua')).toBeInTheDocument()
    const saves = screen.getAllByRole('button', { name: 'Simpan' })
    expect(saves).toHaveLength(2)
    expect(saves[0]).toBeDisabled()
  })
})
