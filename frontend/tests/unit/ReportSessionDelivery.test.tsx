import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen, act } from './test-utils'
import { i18n } from '@/core/i18n'
import { ApiError } from '@/core/services/backend-client'
import { useToastStore } from '@/core/stores/toastStore'
import { ReportStatus, SessionStatus } from '@/core/types/enums'
import type { Participant, Report, Session } from '@/core/types'
import type { ReportSessionExtras, ReportSessionResult } from '@/core/services/types'

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

// Import after mocks are registered
import ReportSessionPage from '@/features/admin/pages/ReportSessionPage'
import { sessionService } from '@/core/services/sessions'
import { assessmentService } from '@/core/services/assessments'
import { programService } from '@/core/services/programs'
import { reportService } from '@/core/services/reports'

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

/**
 * Post-generate server truth: GenerateForSession persists a narrative draft
 * for every worklist row before its flag clears — the completion evidence the
 * interruption watcher reads.
 */
const generatedReport = (status: ReportStatus): Report => ({
 ...reportAna(status),
 ai_narrative_draft: 'Naskah narasi hasil generate',
 mission_ids: ['m-1'],
})

/**
 * Server truth for an active run: the narrative-phase id views plus the
 * per-report items + aggregates the row statuses read (active_generate
 * contract — items are derived from the id views by the server).
 */
const activeGenerate = (extras: { queued_ids: string[]; processing_ids: string[] }): ReportSessionExtras => ({
 active_generate: {
  session_id: 's1',
  started_at: '2026-09-30T00:00:00Z',
  ...extras,
  items: [
   ...extras.queued_ids.map((report_id) => ({ report_id, status: 'queued' as const })),
   ...extras.processing_ids.map((report_id) => ({ report_id, status: 'processing' as const })),
  ],
  total: extras.queued_ids.length + extras.processing_ids.length,
  queued: extras.queued_ids.length,
  processing: extras.processing_ids.length,
  succeeded: 0,
  failed: 0,
 },
})

const activeSend = (extras: { queued_ids: string[]; sending_ids: string[] }): ReportSessionExtras => ({
 active_send: { session_id: 's1', updated_at: '2026-09-30T00:00:00Z', ...extras },
})

function setupMocks(getBySession: () => Promise<ReportSessionResult>): void {
 vi.mocked(sessionService.getById).mockResolvedValue(session as never)
 vi.mocked(sessionService.getParticipants).mockResolvedValue([ana, bela] as never)
 vi.mocked(sessionService.getStages).mockResolvedValue([sessionStage] as never)
 vi.mocked(sessionService.getSubstages).mockResolvedValue([] as never)
 vi.mocked(assessmentService.getBySession).mockResolvedValue([] as never)
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

describe('ReportSessionPage — server-driven per-row delivery state', () => {
 beforeEach(() => {
  vi.clearAllMocks()
  useToastStore.getState().dismissAll()
 })

 afterEach(() => {
  vi.useRealTimers()
 })

 it('shows active_generate rows (queued/processing) and a progress generate button; survives reload without re-firing', async () => {
  const items = [reportAna(ReportStatus.DRAFT), reportBela(ReportStatus.DRAFT)]
  setupMocks(async () => ({
   items,
   extras: activeGenerate({ queued_ids: ['r-ana'], processing_ids: ['r-bela'] }),
  }))

  const first = renderPage()
  await flush()

  // Identical labels for both flows, resolved through i18n at assert-time.
  expect(screen.getByText(i18n.t('admin.status.queued'))).toBeInTheDocument()
  expect(screen.getByText(i18n.t('admin.status.processing'))).toBeInTheDocument()
  const generateBtn = screen.getByRole('button', { name: i18n.t('admin.reports.generating') })
  expect(generateBtn).toBeDisabled()
  // Mount with active_generate must NOT re-fire the blocking POST.
  expect(reportService.generate).not.toHaveBeenCalled()
  expect(reportService.generateOne).not.toHaveBeenCalled()

  // Reload: fresh mount with no local persistence → server truth again.
  first.unmount()
  renderPage()
  await flush()
  expect(screen.getByText(i18n.t('admin.status.queued'))).toBeInTheDocument()
  expect(screen.getByText(i18n.t('admin.status.processing'))).toBeInTheDocument()
  expect(screen.getByRole('button', { name: i18n.t('admin.reports.generating') })).toBeDisabled()
  expect(reportService.generate).not.toHaveBeenCalled()
 })

 it('shows active_send rows (queued/sending) with remaining count on the bulk button; survives reload', async () => {
  const items = [reportAna(ReportStatus.APPROVED), reportBela(ReportStatus.APPROVED)]
  setupMocks(async () => ({
   items,
   extras: activeSend({ queued_ids: ['r-ana'], sending_ids: ['r-bela'] }),
  }))
  vi.mocked(reportService.send).mockResolvedValue({
   id: 'r-ana',
   parent_access_token: 'tok',
   status: 'SENT',
  } as never)

  const first = renderPage()
  await flush()

  expect(screen.getByText(i18n.t('admin.status.queued'))).toBeInTheDocument()
  expect(screen.getByText(i18n.t('admin.status.processing'))).toBeInTheDocument()
  // remaining = queued (1) + in-flight (1)
  const sendBtn = screen.getByRole('button', {
   name: i18n.t('admin.reports.sendAllCount', { count: 2 }),
  })
  expect(sendBtn).toBeDisabled()

  first.unmount()
  renderPage()
  await flush()
  expect(screen.getByText(i18n.t('admin.status.queued'))).toBeInTheDocument()
  expect(screen.getByText(i18n.t('admin.status.processing'))).toBeInTheDocument()
  expect(
   screen.getByRole('button', { name: i18n.t('admin.reports.sendAllCount', { count: 2 }) }),
  ).toBeDisabled()
 })

 it('resumes a server-queued send run on mount, drains the queue, and stops (no infinite loop)', async () => {
  const items = [reportAna(ReportStatus.APPROVED), reportBela(ReportStatus.APPROVED)]
  // After the resumed run completes, the server persists SENT for both rows —
  // the completion evidence the interruption watcher reads.
  const doneItems = [reportAna(ReportStatus.SENT), reportBela(ReportStatus.SENT)]
  let calls = 0
  setupMocks(async () => {
   calls++
   return {
    items: calls === 1 ? items : doneItems,
    extras:
     calls === 1
      ? activeSend({ queued_ids: ['r-ana', 'r-bela'], sending_ids: [] })
      : {},
   }
  })
  vi.mocked(reportService.send).mockResolvedValue({
   id: 'x',
   parent_access_token: 'tok',
   status: 'SENT',
  } as never)

  renderPage()
  await flush(8)

  // Both server-queued rows sent, each declaring the remaining queue
  // (including its own target), refreshed from active_send.queued_ids.
  expect(reportService.send).toHaveBeenCalledTimes(2)
  expect(reportService.send).toHaveBeenNthCalledWith(1, 'r-ana', undefined, ['r-ana', 'r-bela'])
  expect(reportService.send).toHaveBeenNthCalledWith(2, 'r-bela', undefined, ['r-bela'])

  // Loop end → immediate refetch → flags cleared → no further sends.
  expect(screen.queryByText(i18n.t('admin.status.queued'))).toBeNull()
  const total = vi.mocked(reportService.send).mock.calls.length
  await flush(4)
  expect(reportService.send).toHaveBeenCalledTimes(total)
  expect(reportService.send).toHaveBeenCalledTimes(2)
 })

 it('treats HTTP 409 send_in_progress as processing: logs, keeps looping, surfaces no failure', async () => {
  const items = [reportAna(ReportStatus.APPROVED), reportBela(ReportStatus.APPROVED)]
  // Post-run server truth: r-ana's in-flight attempt (the 409) and r-bela's
  // send both end persisted as SENT.
  const doneItems = [reportAna(ReportStatus.SENT), reportBela(ReportStatus.SENT)]
  let calls = 0
  setupMocks(async () => {
   calls++
   return {
    items: calls === 1 ? items : doneItems,
    extras:
     calls === 1
      ? activeSend({ queued_ids: ['r-ana', 'r-bela'], sending_ids: [] })
      : {},
   }
  })
  vi.mocked(reportService.send)
   .mockRejectedValueOnce(new ApiError('send in progress', 'send_in_progress', 409))
   .mockResolvedValueOnce({
    id: 'r-bela',
    parent_access_token: 'tok',
    status: 'SENT',
   } as never)
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })

  try {
   renderPage()
   await flush(8)

   // 409 does not abort the loop and does not count as a failure.
   expect(reportService.send).toHaveBeenCalledTimes(2)
   expect(
    warn.mock.calls.some(
     (args) => args[0] === '[useReportSession] send_in_progress; treated as processing for report',
    ),
   ).toBe(true)
   // No per-row failure banner (sendError stays null).
   expect(screen.queryByText(i18n.t('admin.reports.sendListError'))).toBeNull()
   // The queue still shows server truth after the refetch.
   expect(screen.queryByText(i18n.t('admin.status.queued'))).toBeNull()
  } finally {
   warn.mockRestore()
  }
 })

 it('polls every 2s while flags are present and stops once both flags are absent', async () => {
  vi.useFakeTimers()
  try {
   const items = [reportAna(ReportStatus.DRAFT)]
   let calls = 0
   setupMocks(async () => {
    calls++
    if (calls <= 2) {
     return { items, extras: activeGenerate({ queued_ids: ['r-ana'], processing_ids: [] }) }
    }
    // Run finished: the generated draft persisted (completion evidence).
    return { items: [generatedReport(ReportStatus.DRAFT)], extras: {} }
   })

   renderPage()
   await act(async () => { })
   expect(vi.mocked(reportService.getBySession)).toHaveBeenCalledTimes(1)

   await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
   })
   expect(vi.mocked(reportService.getBySession)).toHaveBeenCalledTimes(2)

   await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
   })
   // Third response is drained → interval cleared.
   expect(vi.mocked(reportService.getBySession)).toHaveBeenCalledTimes(3)
   expect(screen.queryByText(i18n.t('admin.status.queued'))).toBeNull()
   await act(async () => {
    await vi.advanceTimersByTimeAsync(6000)
   })
   expect(vi.mocked(reportService.getBySession)).toHaveBeenCalledTimes(3)
  } finally {
   vi.useRealTimers()
  }
 })

 it('surfaces poll failures via toast + console.warn, keeps last known state, continues next tick', async () => {
  vi.useFakeTimers()
  try {
   const items = [reportAna(ReportStatus.DRAFT)]
   let calls = 0
   setupMocks(async () => {
    calls++
    if (calls === 1) return { items, extras: activeGenerate({ queued_ids: ['r-ana'], processing_ids: [] }) }
    if (calls === 2) throw new Error('network down')
    // Recovery tick: the run finished meanwhile (draft persisted).
    return { items: [generatedReport(ReportStatus.DRAFT)], extras: {} }
   })
   const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })

   try {
    renderPage()
    await act(async () => { })

    await act(async () => {
     await vi.advanceTimersByTimeAsync(2000)
    })
    expect(warn).toHaveBeenCalledWith(
     '[useReportSession] reports refresh failed; keeping last known state',
     expect.any(Error),
    )
    expect(useToastStore.getState().toasts.some((t) => t.type === 'error')).toBe(true)
    // Last known state retained (row still queued) — not cleared on failure.
    expect(screen.getByText(i18n.t('admin.status.queued'))).toBeInTheDocument()

    // The next tick still fires (no crash-loop, no silent stop).
    await act(async () => {
     await vi.advanceTimersByTimeAsync(2000)
    })
    expect(vi.mocked(reportService.getBySession)).toHaveBeenCalledTimes(3)
    expect(screen.queryByText(i18n.t('admin.status.queued'))).toBeNull()
   } finally {
    warn.mockRestore()
   }
  } finally {
   vi.useRealTimers()
  }
 })

 it('one-shot interruption toast when active_generate vanishes before completion was observed (restart)', async () => {
  vi.useFakeTimers()
  try {
   // No ai_narrative_draft → nothing persisted, so a vanished flag is a stop, not a done.
   const items = [reportAna(ReportStatus.DRAFT)]
   let calls = 0
   setupMocks(async () => {
    calls++
    if (calls === 1) return { items, extras: activeGenerate({ queued_ids: ['r-ana'], processing_ids: [] }) }
    return { items, extras: {} }
   })

   renderPage()
   await act(async () => { })
   await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
   })
   await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
   })

   const interrupted = () =>
    useToastStore.getState().toasts.filter(
     (t) => t.message === i18n.t('admin.status.operationInterrupted'),
    )
   expect(interrupted()).toHaveLength(1)
   expect(interrupted()[0].type).toBe('warning')
   // Exactly one confirm refetch (mount + poll tick + refetch), then done.
   expect(vi.mocked(reportService.getBySession)).toHaveBeenCalledTimes(3)
   // State still renders — never blanked, never claimed "done".
   expect(screen.getByText('Ana')).toBeInTheDocument()
   // Registry gone + evidence incomplete → the row shows "terputus", not a
   // fake completion (per-row verdict from extras + persistent evidence).
   const interruptedRow = screen.getByTestId('report-generate-state')
   expect(interruptedRow.getAttribute('data-status')).toBe('interrupted')
   expect(interruptedRow.textContent ?? '').toContain(i18n.t('admin.status.interrupted'))

   // One-shot: later time passes produce no repeat notice and no fetches.
   await act(async () => {
    await vi.advanceTimersByTimeAsync(6000)
   })
   expect(vi.mocked(reportService.getBySession)).toHaveBeenCalledTimes(3)
   expect(interrupted()).toHaveLength(1)
  } finally {
   vi.useRealTimers()
  }
 })

 it('no interruption toast when the watched generate run completes (draft persisted)', async () => {
  vi.useFakeTimers()
  try {
   const items = [reportAna(ReportStatus.DRAFT)]
   let calls = 0
   setupMocks(async () => {
    calls++
    if (calls === 1) return { items, extras: activeGenerate({ queued_ids: ['r-ana'], processing_ids: [] }) }
    return { items: [generatedReport(ReportStatus.DRAFT)], extras: {} }
   })

   renderPage()
   await act(async () => { })
   await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
   })
   await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
   })

   // Completion observed via persisted drafts → no scary notice, no refetch,
   // polling stops with the flags.
   expect(
    useToastStore.getState().toasts.filter(
     (t) => t.message === i18n.t('admin.status.operationInterrupted'),
    ),
   ).toHaveLength(0)
   expect(vi.mocked(reportService.getBySession)).toHaveBeenCalledTimes(2)
   // Registry gone + evidence complete → the watched row shows "selesai"
   // (from persisted draft + missions, not from local state).
   const doneRow = screen.getByTestId('report-generate-state')
   expect(doneRow.getAttribute('data-status')).toBe('success')
   expect(doneRow.textContent ?? '').toContain(i18n.t('admin.status.completed'))
   await act(async () => {
    await vi.advanceTimersByTimeAsync(6000)
   })
   expect(vi.mocked(reportService.getBySession)).toHaveBeenCalledTimes(2)
  } finally {
   vi.useRealTimers()
  }
 })

 it('interruption toast when active_send vanishes with watched rows still unsent (send died with server)', async () => {
  const items = [reportAna(ReportStatus.APPROVED)] // still APPROVED → nothing delivered
  let calls = 0
  setupMocks(async () => {
   calls++
   if (calls === 1) return { items, extras: activeSend({ queued_ids: ['r-ana'], sending_ids: [] }) }
   return { items, extras: {} }
  })
  // The send request dies with the server → no SENT/SEND_FAILED persisted.
  vi.mocked(reportService.send).mockRejectedValue(new TypeError('Failed to fetch'))

  renderPage()
  await flush(10)

  const interrupted = useToastStore.getState().toasts.filter(
   (t) => t.message === i18n.t('admin.status.operationInterrupted'),
  )
  expect(interrupted).toHaveLength(1)
  expect(interrupted[0].type).toBe('warning')
  // The per-row send failure was surfaced too — nothing swallowed.
  expect(screen.getByText(i18n.t('admin.reports.sendListError'))).toBeInTheDocument()
  // Mount + loop-end refetch + one confirm refetch; polling is over.
  expect(vi.mocked(reportService.getBySession)).toHaveBeenCalledTimes(3)
  expect(screen.getByText('Ana')).toBeInTheDocument()
 })

 it('HTTP 404 while polling stops the poll and shows the existing error UI once (no error-loop)', async () => {
  vi.useFakeTimers()
  try {
   const items = [reportAna(ReportStatus.DRAFT)]
   let calls = 0
   setupMocks(async () => {
    calls++
    if (calls === 1) return { items, extras: activeGenerate({ queued_ids: ['r-ana'], processing_ids: [] }) }
    throw new ApiError('not found', 'not_found', 404)
   })
   const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })

   try {
    renderPage()
    await act(async () => { })
    await act(async () => {
     await vi.advanceTimersByTimeAsync(2000)
    })

    expect(warn).toHaveBeenCalledWith(
     '[useReportSession] reports endpoint returned 404; stopping operation polling',
     expect.any(ApiError),
    )
    // Existing error/empty UI path (same message as a failed initial load).
    await act(async () => {
     await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByText(i18n.t('admin.reports.loadDataError'))).toBeInTheDocument()
    expect(
     useToastStore.getState().toasts.filter(
      (t) => t.message === i18n.t('admin.status.operationInterrupted'),
     ),
    ).toHaveLength(0)

    // Polling stopped for good — no error-loop against the dead endpoint.
    await act(async () => {
     await vi.advanceTimersByTimeAsync(10000)
    })
    expect(vi.mocked(reportService.getBySession)).toHaveBeenCalledTimes(2)
   } finally {
    warn.mockRestore()
   }
  } finally {
   vi.useRealTimers()
  }
 })

 it('malformed envelope from the reports list surfaces the error state (no blank screen, no retry loop)', async () => {
  setupMocks(async () => ({ items: [], extras: {} }))
  vi.mocked(reportService.getBySession).mockRejectedValue(
   new ApiError('unexpected response body', 'unexpected_response', 502),
  )

  renderPage()
  await flush()

  expect(screen.getByText(i18n.t('admin.reports.loadDataError'))).toBeInTheDocument()
  // No silent blank screen and no infinite auto-retry.
  expect(vi.mocked(reportService.getBySession)).toHaveBeenCalledTimes(1)
 })

 it('renders a failed item as error + phase + message straight from server extras', async () => {
  const items = [reportAna(ReportStatus.DRAFT), reportBela(ReportStatus.DRAFT)]
  setupMocks(async () => ({
   items,
   extras: {
    active_generate: {
     session_id: 's1',
     started_at: '2026-09-30T00:00:00Z',
     queued_ids: ['r-ana'],
     processing_ids: [],
     items: [
      { report_id: 'r-ana', status: 'queued' as const },
      {
       report_id: 'r-bela',
       status: 'error' as const,
       phase: 'missions' as const,
       error: 'mission_selection_failed: kandidat misi kosong',
      },
     ],
     total: 2,
     queued: 1,
     processing: 0,
     succeeded: 0,
     failed: 1,
    },
   },
  }))

  renderPage()
  await flush()

  const statuses = screen
   .getAllByTestId('report-generate-state')
   .map((el) => el.getAttribute('data-status'))
  expect(statuses).toEqual(['queued', 'error'])
  // The error row shows the label, its phase and the server-provided message.
  const errorRow = screen
   .getAllByTestId('report-generate-state')
   .find((el) => el.getAttribute('data-status') === 'error')
  expect(errorRow?.textContent ?? '').toContain(i18n.t('admin.status.error'))
  expect(errorRow?.textContent ?? '').toContain(i18n.t('admin.status.phaseMissions'))
  expect(screen.getByTestId('report-generate-error').textContent).toContain(
   'mission_selection_failed: kandidat misi kosong',
  )
 })

 it('a reload with identical extras computes the identical per-row statuses (no local status state)', async () => {
  const items = [reportAna(ReportStatus.DRAFT), reportBela(ReportStatus.DRAFT)]
  const extras: ReportSessionExtras = {
   active_generate: {
    session_id: 's1',
    started_at: '2026-09-30T00:00:00Z',
    queued_ids: ['r-ana'],
    processing_ids: ['r-bela'],
    items: [
     { report_id: 'r-ana', status: 'queued' },
     { report_id: 'r-bela', status: 'processing', phase: 'narrative' },
    ],
    total: 2,
    queued: 1,
    processing: 1,
    succeeded: 0,
    failed: 0,
   },
  }
  setupMocks(async () => ({ items, extras }))

  const first = renderPage()
  await flush()
  const before = screen
   .getAllByTestId('report-generate-state')
   .map((el) => `${el.getAttribute('data-status')}:${el.textContent ?? ''}`)
  expect(before).toHaveLength(2)

  first.unmount()
  renderPage()
  await flush()
  const after = screen
   .getAllByTestId('report-generate-state')
   .map((el) => `${el.getAttribute('data-status')}:${el.textContent ?? ''}`)

  expect(after).toEqual(before)
 })

 it('accepts the 202 and polls server truth immediately (statuses never wait on a blocking POST)', async () => {
  vi.useFakeTimers()
  try {
   let calls = 0
   setupMocks(async () => {
    calls++
    if (calls === 1) return { items: [], extras: {} } // nothing generated yet
    return {
     items: [reportAna(ReportStatus.DRAFT)],
     extras: activeGenerate({ queued_ids: ['r-ana'], processing_ids: [] }),
    }
   })
   // p1 has assessments (ready_to_generate), p2 does not (skipped participant).
   vi.mocked(sessionService.getSubstages).mockResolvedValue([
    { id: 'sub1', session_stage_id: 'st1' },
   ] as never)
   vi.mocked(assessmentService.getBySession).mockResolvedValue([
    { participant_id: 'p1', session_substage_id: 'sub1', star_rating: 5 },
   ] as never)
   // The endpoint acknowledges acceptance (202) instead of returning the
   // finished reports — the hook must not block on completion.
   vi.mocked(reportService.generate).mockResolvedValue(undefined)

   renderPage()
   await act(async () => { })

   const generateBtn = screen.getByRole('button', { name: i18n.t('admin.reports.generateAll') })
   await act(async () => {
    generateBtn.click()
   })
   await flush(4)

   expect(reportService.generate).toHaveBeenCalledTimes(1)
   expect(reportService.generate).toHaveBeenCalledWith('s1')
   // The post-202 refetch already observes active_generate → the row status
   // comes from the polled extras, not from the local click.
   expect(vi.mocked(reportService.getBySession).mock.calls.length).toBeGreaterThanOrEqual(2)
   const rowState = screen.getAllByTestId('report-generate-state')[0]
   expect(rowState.getAttribute('data-status')).toBe('queued')
   // The server flag keeps the 2s interval polling alive afterwards.
   await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
   })
   expect(vi.mocked(reportService.getBySession).mock.calls.length).toBeGreaterThanOrEqual(3)
  } finally {
   vi.useRealTimers()
  }
 })

 it('a failed generate POST surfaces the error inline, releases the loading bridge, and never fakes server status', async () => {
  // No reports yet + assessments for both rows → both ready_to_generate
  // (nothing to skip, so the failure path does not open the skip modal).
  setupMocks(async () => ({ items: [], extras: {} }))
  vi.mocked(sessionService.getSubstages).mockResolvedValue([
   { id: 'sub1', session_stage_id: 'st1' },
  ] as never)
  vi.mocked(assessmentService.getBySession).mockResolvedValue([
   { participant_id: 'p1', session_substage_id: 'sub1', star_rating: 5 },
   { participant_id: 'p2', session_substage_id: 'sub1', star_rating: 4 },
  ] as never)
  // Network error: the POST rejects before the server registers any run.
  vi.mocked(reportService.generate).mockRejectedValue(new TypeError('Failed to fetch'))

  renderPage()
  await flush()

  const generateBtn = screen.getByRole('button', { name: i18n.t('admin.reports.generateAll') })
  expect(generateBtn).toBeEnabled()
  await act(async () => {
   generateBtn.click()
  })
  await flush(4)

  expect(reportService.generate).toHaveBeenCalledTimes(1)

  // The failure is surfaced inline (genError banner) — never swallowed.
  expect(screen.getByText('Failed to fetch')).toBeInTheDocument()

  // Loading bridge released: the bulk button is idle again, not stuck on the
  // "generating" spinner.
  expect(screen.queryByRole('button', { name: i18n.t('admin.reports.generating') })).toBeNull()
  expect(screen.getByRole('button', { name: i18n.t('admin.reports.generateAll') })).toBeEnabled()

  // Row status stays server-sourced: no generate overlay was invented locally
  // (no active_generate was ever observed), so there is no fake
  // queued/success state — rows keep their server-derived ready badge.
  expect(screen.queryAllByTestId('report-generate-state')).toHaveLength(0)
  expect(screen.getAllByText(i18n.t('admin.reports.readyGenerate'))).toHaveLength(2)

  // No polling armed for a run that never started, and no interruption toast
  // double-reports the failure genError already carries.
  expect(vi.mocked(reportService.getBySession)).toHaveBeenCalledTimes(1)
  expect(
   useToastStore.getState().toasts.filter(
    (t) => t.message === i18n.t('admin.status.operationInterrupted'),
   ),
  ).toHaveLength(0)
 })
})
