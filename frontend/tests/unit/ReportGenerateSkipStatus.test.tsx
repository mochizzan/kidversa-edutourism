import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen, act } from './test-utils'
import { i18n } from '@/core/i18n'
import { ReportStatus, SessionStatus } from '@/core/types/enums'
import type { Participant, Report, Session } from '@/core/types'
import type { ReportGenerateItem, ReportSessionExtras, ReportSessionResult } from '@/core/services/types'

// ── Mocks (registered before importing the page) ──────────────────────────
vi.mock('@/core/services/sessions', () => ({
 sessionService: {
  getById: vi.fn(),
  getParticipants: vi.fn(),
  getStages: vi.fn(),
  getSubstages: vi.fn(),
 },
}))

vi.mock('@/core/services/assessments', () => ({
 assessmentService: { getBySession: vi.fn() },
}))

vi.mock('@/core/services/programs', () => ({
 programService: { getStages: vi.fn() },
}))

vi.mock('@/core/services/reports', () => ({
 reportService: {
  getBySession: vi.fn(),
  generate: vi.fn(),
  generateOne: vi.fn(),
  send: vi.fn(),
 },
}))

vi.mock('@/core/services/attendance', () => ({
 attendanceService: {
  getBySession: vi.fn(),
  upsert: vi.fn(),
 },
}))

// Import after mocks are registered
import ReportSessionPage from '@/features/admin/pages/ReportSessionPage'
import { sessionService } from '@/core/services/sessions'
import { assessmentService } from '@/core/services/assessments'
import { programService } from '@/core/services/programs'
import { attendanceService } from '@/core/services/attendance'
import { reportService } from '@/core/services/reports'
import { useToastStore } from '@/core/stores/toastStore'

// ── Fixtures ──────────────────────────────────────────────────────────────
const session: Session = {
 id: 's1',
 tenant_id: 't1',
 program_id: 'pg1',
 name: 'Sesi Lapangan',
 session_date: '2026-09-30',
 location: 'Lab',
 status: SessionStatus.ACTIVE,
 created_by: 'u1',
 created_at: '2026-09-30T00:00:00Z',
}

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

const sessionStage = { id: 'st1', session_id: 's1', program_stage_id: 'ps1', status: 'ACTIVE' }
const programStage = { id: 'ps1', name: 'Topik Satu' }

const reportAna = (status: ReportStatus): Report => ({
 id: 'r-ana',
 participant_id: 'p1',
 session_id: 's1',
 program_stage_id: 'ps1',
 status,
 parent_access_token: '',
})

const reportBela = (status: ReportStatus): Report => ({
 id: 'r-bela',
 participant_id: 'p2',
 session_id: 's1',
 program_stage_id: 'ps1',
 status,
 parent_access_token: '',
})

/** Ana: fully skipped — the server generated nothing for her. */
const anaFullySkipped = reportAna(ReportStatus.DRAFT)
/** Bela: narrative generated, mission phase skipped — partial skip. */
const belaNarrativeOnly: Report = {
 ...reportBela(ReportStatus.DRAFT),
 ai_narrative_draft: 'Naskah narasi hasil generate',
 mission_ids: [],
}

function setupMocks(getBySession: () => Promise<ReportSessionResult>): void {
 vi.mocked(sessionService.getById).mockResolvedValue(session as never)
 vi.mocked(sessionService.getParticipants).mockResolvedValue([ana, bela] as never)
 vi.mocked(sessionService.getStages).mockResolvedValue([sessionStage] as never)
 vi.mocked(sessionService.getSubstages).mockResolvedValue([] as never)
 vi.mocked(assessmentService.getBySession).mockResolvedValue([] as never)
 vi.mocked(attendanceService.getBySession).mockResolvedValue([] as never)
 vi.mocked(programService.getStages).mockResolvedValue([programStage] as never)
 vi.mocked(reportService.getBySession).mockImplementation(getBySession)
}

function renderPage() {
 return render(
  <MemoryRouter initialEntries={['/admin/reports/s1']}>
   <Routes>
    <Route path="/admin/reports/:sessionId" element={<ReportSessionPage />} />
   </Routes>
  </MemoryRouter>,
 )
}

/** Drains async chains (load → effects → loops → refetch) inside act(). */
async function flush(rounds = 6): Promise<void> {
 for (let i = 0; i < rounds; i++) {
  await act(async () => { })
 }
}

const interruptedToasts = () =>
 useToastStore.getState().toasts.filter(
  (t) => t.message === i18n.t('admin.status.operationInterrupted'),
 )

/** One live active_generate registry carrying the skip contract per item. */
function liveGenerate(items: ReportGenerateItem[], queuedIds: string[] = []): ReportSessionExtras {
 return {
  active_generate: {
   session_id: 's1',
   started_at: '2026-09-30T00:00:00Z',
   queued_ids: queuedIds,
   processing_ids: [],
   items,
   total: items.length,
   queued: queuedIds.length,
   processing: 0,
   succeeded: 1,
   failed: 0,
  },
 }
}

describe('generate skip statuses — explicit per-participant rendering (Bug 1)', () => {
 beforeEach(() => {
  vi.clearAllMocks()
  useToastStore.getState().dismissAll()
 })

 afterEach(() => {
  vi.useRealTimers()
 })

 it('renders a full skip and a partial skip explicitly: status label plus the phase reason on each row', async () => {
  setupMocks(async () => ({
   items: [anaFullySkipped, belaNarrativeOnly],
   extras: liveGenerate([
    {
     report_id: 'r-ana',
     status: 'skipped',
     mission_skip_reason: 'mission_bank_empty',
     narrative_skip_reason: 'no_assessments',
    },
    {
     report_id: 'r-bela',
     status: 'success',
     mission_skip_reason: 'mission_bank_empty',
    },
   ]),
  }))

  renderPage()
  await flush()

  const rows = screen.getAllByTestId('report-generate-state')
  const skippedRow = rows.find((el) => el.getAttribute('data-status') === 'skipped')
  const successRow = rows.find((el) => el.getAttribute('data-status') === 'success')
  expect(skippedRow).toBeDefined()
  expect(successRow).toBeDefined()

  // Full skip: the row SAYS it was skipped — never silent.
  expect(skippedRow?.textContent).toContain(i18n.t('admin.status.skipped'))
  expect(screen.getByTestId('report-generate-narrative-skip').textContent).toBe(
   i18n.t('admin.status.narrativeSkipNoAssessments'),
  )
  // Mission skip reason on BOTH rows (full skip + partial skip).
  const missionSkips = screen.getAllByTestId('report-generate-mission-skip')
  expect(missionSkips).toHaveLength(2)
  for (const el of missionSkips) {
   expect(el.textContent).toBe(i18n.t('admin.status.missionSkipBankEmpty'))
  }

  // Partial skip renders BOTH facts: narrative generated (success) AND
  // mission skipped with its reason.
  expect(successRow?.textContent).toContain(i18n.t('admin.status.completed'))
  expect(successRow?.textContent).toContain(i18n.t('admin.status.missionSkipBankEmpty'))
 })

 it('renders an unknown server skip code raw instead of dropping it', async () => {
  setupMocks(async () => ({
   items: [anaFullySkipped],
   extras: liveGenerate([
    {
     report_id: 'r-ana',
     status: 'skipped',
     narrative_skip_reason: 'phase_disabled_future_code',
    },
   ]),
  }))

  renderPage()
  await flush()

  expect(screen.getByTestId('report-generate-narrative-skip').textContent).toBe(
   'phase_disabled_future_code',
  )
 })

 it('a run ending in explicit skips settles silently and keeps the skip verdicts after the registry clears', async () => {
  vi.useFakeTimers()
  try {
   // Run observed once (id views still non-empty, items already terminal),
   // then the registry is gone: rows fall back to the captured verdicts.
   let calls = 0
   setupMocks(async () => {
    calls++
    if (calls === 1) {
     return {
      items: [anaFullySkipped, belaNarrativeOnly],
      extras: liveGenerate(
       [
        {
         report_id: 'r-ana',
         status: 'skipped',
         mission_skip_reason: 'mission_bank_empty',
         narrative_skip_reason: 'no_assessments',
        },
        {
         report_id: 'r-bela',
         status: 'success',
         mission_skip_reason: 'mission_bank_empty',
        },
       ],
       ['r-ana', 'r-bela'],
      ),
     }
    }
    return { items: [anaFullySkipped, belaNarrativeOnly], extras: {} }
   })

   renderPage()
   await act(async () => { })
   expect(vi.mocked(reportService.getBySession)).toHaveBeenCalledTimes(1)

   // Registry vanishes on the next tick: skips are terminal server verdicts,
   // so this must NOT one-shot a "server process interrupted" notice …
   await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
   })
   expect(vi.mocked(reportService.getBySession)).toHaveBeenCalledTimes(2)
   expect(interruptedToasts()).toHaveLength(0)

   // … and the verdicts must survive: full skip stays a skip with both
   // reasons, the partial skip stays a success carrying the mission reason.
   const rows = screen.getAllByTestId('report-generate-state')
   const skippedRow = rows.find((el) => el.getAttribute('data-status') === 'skipped')
   const successRow = rows.find((el) => el.getAttribute('data-status') === 'success')
   expect(skippedRow).toBeDefined()
   expect(successRow).toBeDefined()
   expect(skippedRow?.textContent).toContain(i18n.t('admin.status.skipped'))
   expect(skippedRow?.textContent).toContain(i18n.t('admin.status.narrativeSkipNoAssessments'))
   expect(skippedRow?.textContent).toContain(i18n.t('admin.status.missionSkipBankEmpty'))
   expect(successRow?.textContent).toContain(i18n.t('admin.status.completed'))
   expect(successRow?.textContent).toContain(i18n.t('admin.status.missionSkipBankEmpty'))

   // Polling is over (registry cleared) — no further fetches, still no toast.
   await act(async () => {
    await vi.advanceTimersByTimeAsync(6000)
   })
   expect(vi.mocked(reportService.getBySession)).toHaveBeenCalledTimes(2)
   expect(interruptedToasts()).toHaveLength(0)
  } finally {
   vi.useRealTimers()
  }
 })
})
