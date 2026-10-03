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

vi.mock('@/core/services/program-substages', () => ({
  programSubstageService: { listByStage: vi.fn() },
}))

vi.mock('@/core/services/assessments', () => ({
  assessmentService: { getBySession: vi.fn(), getByParticipant: vi.fn(), upsert: vi.fn() },
}))

vi.mock('@/core/services/attendance', () => ({
  attendanceService: { getBySession: vi.fn(), upsert: vi.fn() },
}))

vi.mock('@/core/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

import ChildAssessmentPage from '@/features/fasilitator/pages/ChildAssessmentPage'
import { sessionService } from '@/core/services/sessions'
import { programService } from '@/core/services/programs'
import { programSubstageService } from '@/core/services/program-substages'
import { assessmentService } from '@/core/services/assessments'
import { attendanceService } from '@/core/services/attendance'
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

const kegiatanLeaf = {
  id: 'k1',
  session_id: 's-1',
  session_stage_id: 'ss1',
  program_substage_id: 'psk1',
  created_at: '2026-09-30T01:00:00Z',
}

async function flush() {
  for (let i = 0; i < 4; i++) {
    await act(async () => { })
  }
}

async function renderAssessmentPage(groupStatus: string) {
  vi.mocked(sessionService.getParticipantById).mockResolvedValue(participant as never)
  vi.mocked(sessionService.getById).mockResolvedValue(makeDetail(groupStatus) as never)
  vi.mocked(sessionService.getSubstages).mockResolvedValue([kegiatanLeaf] as never)
  vi.mocked(programService.getStages).mockResolvedValue([
    { id: 'ps1', program_id: 'p1', sequence_order: 1, name: 'Topik Satu', content_type: 'TEXT' },
  ] as never)
  vi.mocked(programSubstageService.listByStage).mockResolvedValue([
    { id: 'psk1', program_stage_id: 'ps1', name: 'Kegiatan Satu' },
  ] as never)
  vi.mocked(assessmentService.getByParticipant).mockResolvedValue([] as never)
  vi.mocked(assessmentService.upsert).mockResolvedValue({} as never)
  vi.mocked(attendanceService.getBySession).mockResolvedValue([
    { participant_id: 'c-1', is_present: true },
  ] as never)

  const result = render(
    <MemoryRouter
      initialEntries={[{ pathname: '/fasilitator/groups/g-1/children/c-1', state: { sessionId: 's-1' } }]}
    >
      <Routes>
        <Route path="/fasilitator/groups/:groupId/children/:childId" element={<ChildAssessmentPage />} />
      </Routes>
    </MemoryRouter>,
  )
  await flush()
  return result
}

function starButtons() {
  return screen.getAllByRole('button', { name: /dari 5 bintang/ })
}

describe('ChildAssessmentPage: COMPLETED group locks grading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    useToastStore.setState({ toasts: [] })
  })

  it('renders stars, comment and save DISABLED on a COMPLETED group; interactions never call upsert', async () => {
    await renderAssessmentPage('COMPLETED')

    // Data stays visible (read-only rendering): the Kegiatan card is on screen.
    expect(screen.getByText('Kegiatan Satu')).toBeInTheDocument()

    const stars = starButtons()
    expect(stars).toHaveLength(4)
    for (const star of stars) {
      expect(star).toBeDisabled()
    }
    const comment = screen.getByPlaceholderText('Tulis komentar tentang kegiatan ini...')
    expect(comment).toBeDisabled()
    const save = screen.getByRole('button', { name: 'Simpan' })
    expect(save).toBeDisabled()

    await act(async () => {
      fireEvent.click(stars[2])
      fireEvent.click(save)
    })

    expect(assessmentService.upsert).not.toHaveBeenCalled()
  })

  it('keeps grading enabled on a non-completed group: star selection enables save and persists', async () => {
    await renderAssessmentPage('IN_PROGRESS')

    const stars = starButtons()
    expect(stars[2]).not.toBeDisabled()

    await act(async () => {
      fireEvent.click(stars[2])
    })

    const save = screen.getByRole('button', { name: 'Simpan' })
    expect(save).not.toBeDisabled()

    await act(async () => {
      fireEvent.click(save)
    })

    expect(assessmentService.upsert).toHaveBeenCalledTimes(1)
    expect(assessmentService.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        participant_id: 'c-1',
        session_id: 's-1',
        session_substage_id: 'k1',
        star_rating: 3,
      }),
    )
  })
})
