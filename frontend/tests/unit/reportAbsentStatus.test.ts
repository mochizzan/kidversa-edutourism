import { describe, it, expect, vi } from 'vitest'

// ── Mocks (registered before importing the hook module) ───────────────────
// The module under test exposes the pure row builder; the service mocks keep
// the hook's runtime dependencies inert for this import.
vi.mock('@/core/services/sessions', () => ({ sessionService: {} }))
vi.mock('@/core/services/reports', () => ({ reportService: {} }))
vi.mock('@/core/services/assessments', () => ({ assessmentService: {} }))
vi.mock('@/core/services/attendance', () => ({ attendanceService: {} }))
vi.mock('@/core/services/programs', () => ({ programService: {} }))

import { buildReportListItems } from '@/features/admin/hooks/useReportSession'
import { ReportStatus } from '@/core/types/enums'
import type { Assessment, Participant, Report } from '@/core/types'

const ana: Participant = {
 id: 'p1',
 child_name: 'Ana',
 child_age: 9,
 school_name: 'SD A',
 parent_name: 'Budi',
 parent_phone: '6281110001',
 consent_photo: false,
 created_at: '2026-09-01T00:00:00Z',
}

const bela: Participant = {
 id: 'p2',
 child_name: 'Bela',
 child_age: 10,
 school_name: 'SD B',
 parent_name: 'Citra',
 parent_phone: '6281110002',
 consent_photo: false,
 created_at: '2026-09-01T00:00:00Z',
}

const anaReport: Report = {
 id: 'r-ana',
 participant_id: 'p1',
 session_id: 's1',
 program_stage_id: 'ps1',
 status: ReportStatus.DRAFT,
 parent_access_token: '',
}

const belaReport: Report = {
 id: 'r-bela',
 participant_id: 'p2',
 session_id: 's1',
 program_stage_id: 'ps1',
 status: ReportStatus.DRAFT,
 parent_access_token: '',
}

const anaAssessment: Assessment = {
 id: 'a1',
 participant_id: 'p1',
 session_substage_id: 'ss1',
 star_rating: 4,
 assessed_by: 'u1',
 assessed_at: '2026-09-10T00:00:00Z',
 updated_at: '2026-09-10T00:00:00Z',
}

const belaAssessment: Assessment = {
 id: 'a2',
 participant_id: 'p2',
 session_substage_id: 'ss1',
 star_rating: 5,
 assessed_by: 'u1',
 assessed_at: '2026-09-10T00:00:00Z',
 updated_at: '2026-09-10T00:00:00Z',
}

describe('buildReportListItems — absent status (explicit attendance row)', () => {
 it('marks an absent participant absent even when a report exists (absence outranks has_report)', () => {
  const items = buildReportListItems([anaReport, belaReport], {
   participants: [ana, bela],
   assessments: [anaAssessment, belaAssessment],
   topicTabs: [{ programStageId: 'ps1', name: 'Topik Satu' }],
   topicSubIds: new Map([['ps1', new Set(['ss1'])]]),
   absentIds: new Set(['p1']),
  })

  const absentRow = items.find((r) => r.participant.id === 'p1')
  expect(absentRow?.status).toBe('absent')
  // The persisted report stays attached: the row shows the absent tag next to
  // the report's own status badge (generation is blocked server-side).
  expect(absentRow?.report?.id).toBe('r-ana')
  // Unaffected control row keeps the normal status.
  expect(items.find((r) => r.participant.id === 'p2')?.status).toBe('has_report')
  // Absent rows sort first (highest precedence).
  expect(items[0]?.participant.id).toBe('p1')
 })

 it('marks an absent participant absent instead of ready_to_generate, excluding it from eligible rows', () => {
  // No report + assessments > 0 would normally be ready_to_generate; the
  // explicit absence row overrides it, and handleGenerateAll's eligible
  // filter selects exactly status === 'ready_to_generate'.
  const items = buildReportListItems([], {
   participants: [ana, bela],
   assessments: [anaAssessment, belaAssessment],
   topicTabs: [{ programStageId: 'ps1', name: 'Topik Satu' }],
   topicSubIds: new Map([['ps1', new Set(['ss1'])]]),
   absentIds: new Set(['p1']),
  })

  expect(items.find((r) => r.participant.id === 'p1')?.status).toBe('absent')

  const eligible = items.filter((r) => r.status === 'ready_to_generate')
  expect(eligible.map((r) => r.participant.id)).toEqual(['p2'])
  expect(eligible.some((r) => r.participant.id === 'p1')).toBe(false)
 })

 it('keeps a participant without an absence row ready_to_generate (unmarked ≠ absent)', () => {
  // absentIds is EMPTY: nobody has an explicit is_present=false row, so the
  // normal report/assessment statuses apply.
  const items = buildReportListItems([], {
   participants: [ana],
   assessments: [anaAssessment],
   topicTabs: [{ programStageId: 'ps1', name: 'Topik Satu' }],
   topicSubIds: new Map([['ps1', new Set(['ss1'])]]),
   absentIds: new Set<string>(),
  })

  expect(items[0]?.status).toBe('ready_to_generate')
 })
})
