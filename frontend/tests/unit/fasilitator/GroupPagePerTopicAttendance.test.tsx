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
  attendanceService: { getBySession: vi.fn(), getByTopic: vi.fn(), upsert: vi.fn() },
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
import type { AttendanceUpsertDTO } from '@/core/types'

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

const assessments: unknown[] = []

const att = (topic: string, present: boolean) => ({
  id: `at-${topic}`,
  participant_id: 'c-1',
  session_id: 's-1',
  session_stage_id: topic,
  is_present: present,
  marked_at: '2026-09-30T01:30:00Z',
  created_at: '2026-09-30T01:30:00Z',
  updated_at: '2026-09-30T01:30:00Z',
})

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

function topicSelect(): HTMLSelectElement {
  return screen.getByRole('combobox', { name: 'Pilih topik' }) as HTMLSelectElement
}

function seedMocks() {
  vi.mocked(sessionService.getAll).mockResolvedValue({ data: [{ id: 's-1' }] } as never)
  vi.mocked(sessionService.getById).mockResolvedValue(makeDetail() as never)
  vi.mocked(sessionService.getSubstages).mockResolvedValue(substages as never)
  vi.mocked(programService.getStages).mockResolvedValue(programStages as never)
  vi.mocked(assessmentService.getBySession).mockResolvedValue(assessments as never)
  vi.mocked(liveService.getGroupsWithProgress).mockResolvedValue([] as never)
}

function renderGroupPage() {
  return render(
    <MemoryRouter initialEntries={['/fasilitator/groups/g-1']}>
      <Routes>
        <Route path="/fasilitator/groups/:groupId" element={<GroupPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('GroupPage: per-topic attendance isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    useToastStore.setState({ toasts: [] })
    seedMocks()
  })

  it('toggling topic B absent leaves topic A present; payloads carry the matching session_stage_id', async () => {
    // Budi present in BOTH topics.
    vi.mocked(attendanceService.getBySession).mockResolvedValue([att('ss1', true), att('ss2', true)] as never)
    vi.mocked(attendanceService.getByTopic).mockImplementation(async (_s: string, topic: string) =>
      ([topic === 'ss2' ? att('ss2', true) : att('ss1', true)]) as never,
    )
    vi.mocked(attendanceService.upsert).mockResolvedValue(att('ss2', false) as never)

    renderGroupPage()
    await flush()

    // Topic A (initial): present.
    expect(topicSelect().value).toBe('ss1')
    expect(screen.getByRole('button', { name: 'Hadir' })).toBeInTheDocument()

    // Switch to topic B → refetch runs for ss2 → present as seeded.
    await act(async () => {
      fireEvent.change(topicSelect(), { target: { value: 'ss2' } })
    })
    await flush()
    expect(topicSelect().value).toBe('ss2')
    expect(attendanceService.getByTopic).toHaveBeenCalledWith('s-1', 'ss2')
    expect(screen.getByRole('button', { name: 'Hadir' })).toBeInTheDocument()

    // Toggle topic B to ABSENT: payload keyed ss2 with is_present false.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hadir' }))
    })
    expect(attendanceService.upsert).toHaveBeenCalledWith({
      participant_id: 'c-1',
      session_id: 's-1',
      session_stage_id: 'ss2',
      is_present: false,
    })
    expect(screen.getByRole('button', { name: 'Tidak Hadir' })).toBeInTheDocument()

    // Back to topic A: still present — topic B's toggle never touched it.
    await act(async () => {
      fireEvent.change(topicSelect(), { target: { value: 'ss1' } })
    })
    await flush()
    expect(screen.getByRole('button', { name: 'Hadir' })).toBeInTheDocument()
    const firstUpsertPayloads = vi.mocked(attendanceService.upsert).mock.calls.map((call: AttendanceUpsertDTO[]) => call[0])
    expect(firstUpsertPayloads.length).toBeGreaterThan(0)
    for (const payload of firstUpsertPayloads) {
      expect(payload.session_stage_id).toBe('ss2')
    }
  })

  it('toggling topic A present does not create or alter a topic B row', async () => {
    // Both topics start with NO rows (fully unmarked).
    vi.mocked(attendanceService.getBySession).mockResolvedValue([] as never)
    vi.mocked(attendanceService.getByTopic).mockResolvedValue([] as never)
    vi.mocked(attendanceService.upsert).mockResolvedValue(att('ss1', true) as never)

    renderGroupPage()
    await flush()

    // Topic A unmarked → toggle marks ss1 present.
    expect(screen.getByRole('button', { name: 'Tidak Hadir' })).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tidak Hadir' }))
    })
    expect(attendanceService.upsert).toHaveBeenCalledTimes(1)
    expect(attendanceService.upsert).toHaveBeenCalledWith({
      participant_id: 'c-1',
      session_id: 's-1',
      session_stage_id: 'ss1',
      is_present: true,
    })
    expect(screen.getByRole('button', { name: 'Hadir' })).toBeInTheDocument()

    // Topic B still unmarked — no ss2 payload was ever sent.
    await act(async () => {
      fireEvent.change(topicSelect(), { target: { value: 'ss2' } })
    })
    await flush()
    expect(screen.getByRole('button', { name: 'Tidak Hadir' })).toBeInTheDocument()
    const secondUpsertPayloads = vi.mocked(attendanceService.upsert).mock.calls.map((call: AttendanceUpsertDTO[]) => call[0])
    expect(secondUpsertPayloads.length).toBe(1)
    for (const payload of secondUpsertPayloads) {
      expect(payload.session_stage_id).toBe('ss1')
    }
  })
})
