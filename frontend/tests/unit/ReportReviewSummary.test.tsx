import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen, act } from './test-utils'
import { i18n } from '@/core/i18n'
import { ReportStatus } from '@/core/types/enums'
import { formatDate } from '@/shared/utils'

// ── Mocks (registered before importing the page) ──────────────────────────
// The hook is mocked wholesale: the summary contract under test is
// report → getMessage → verbatim card render, not the hook's data loading.
vi.mock('@/features/admin/hooks/useReportReview', () => ({
  useReportReview: vi.fn(),
}))

vi.mock('@/core/services/reports', () => ({
  reportService: {
    getMessage: vi.fn(),
  },
}))

// BadgeList fetches its own badges while the page renders.
vi.mock('@/core/services/badges', () => ({
  badgeService: {
    listByParticipant: vi.fn(),
  },
}))

// Import after mocks are registered
import ReportReviewPage from '@/features/admin/pages/ReportReviewPage'
import { useReportReview } from '@/features/admin/hooks/useReportReview'
import { reportService } from '@/core/services/reports'
import { badgeService } from '@/core/services/badges'

// ── Fixtures ──────────────────────────────────────────────────────────────
// EXACT server template: newlines + emoji must survive the render untouched.
const SERVER_MESSAGE =
  'Halo Budi 👋\n\nLaporan Budi sudah terkirim:\n• Narasi: cerita dari server\n• Misi: Misi Andal ✅\n\nSalam, Kidversa 🚀'

// Local fragments the OLD hand-assembled card used to render — none of them
// may appear anywhere on a SENT report page (the message owns them now).
const LOCAL_NARRATIVE = 'Narasi lokal yang tidak boleh ikut tampil'
const LOCAL_MISSION = 'Misi lokal yang tidak boleh ikut tampil'

const SENT_REPORT = {
  id: 'r-1',
  participant_id: 'c-1',
  session_id: 's-1',
  program_stage_id: 'ps1',
  status: ReportStatus.SENT,
  sent_at: '2026-09-30T10:15:00Z',
  parent_access_token: '',
  mission_ids: ['m-1'],
  ai_narrative_final: LOCAL_NARRATIVE,
}

const hookValue = {
  report: SENT_REPORT,
  topics: [{ programStageId: 'ps1', name: 'Topik Satu' }],
  activeTopicId: 'ps1',
  setActiveTopicId: vi.fn(),
  suggesting: false,
  session: {
    id: 's-1',
    name: 'Sesi Lapangan',
    session_date: '2026-09-30',
    location: 'Lab',
    program_id: 'p1',
  },
  participant: {
    id: 'c-1',
    child_name: 'Budi',
    child_age: 7,
    school_name: 'SD Satu',
    parent_name: 'Adit',
    consent_photo: true,
  },
  photo: null,
  stageInfos: [],
  missions: [{ id: 'm-1', title: LOCAL_MISSION }],
  assignedMissionIds: ['m-1'],
  narrativeText: LOCAL_NARRATIVE,
  setNarrativeText: vi.fn(),
  loading: false,
  error: null,
  actionLoading: null,
  loadData: vi.fn(),
  toggleMission: vi.fn(),
  handleSuggestMissions: vi.fn(),
  handleApprove: vi.fn(),
  handleSend: vi.fn(),
  handleCetak: vi.fn(),
  handleDownloadPdf: vi.fn(),
  handleDownloadPng: vi.fn(),
  hasNoAssessment: false,
  streaming: false,
  handleGenerateNarrative: vi.fn(),
  groupCompleted: true,
}

function setup(): void {
  vi.mocked(useReportReview).mockReturnValue(hookValue as never)
  vi.mocked(badgeService.listByParticipant).mockResolvedValue([] as never)
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/reports/s-1/review/c-1']}>
      <Routes>
        <Route
          path="/admin/reports/:sessionId/review/:participantId"
          element={<ReportReviewPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

/** Drains async chains (fetch effect → state updates → re-render) in act(). */
async function flush(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => { })
  }
}

function summaryMessageElement(): Element | null {
  const title = screen.getByText(i18n.t('admin.review.sentSummaryTitle'))
  const card = title.closest('.bg-surface')
  expect(card).not.toBeNull()
  return card?.querySelector('p.whitespace-pre-wrap') ?? null
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ReportReviewPage — "Ringkasan yang Dikirim" = server template', () => {
  it('renders the getMessage payload VERBATIM (character-exact, newlines + emoji intact)', async () => {
    vi.mocked(reportService.getMessage).mockResolvedValue({ message: SERVER_MESSAGE })
    setup()

    renderPage()
    await flush()

    // Wired to the report being reviewed — fetched once per report.id.
    expect(reportService.getMessage).toHaveBeenCalledTimes(1)
    expect(reportService.getMessage).toHaveBeenCalledWith('r-1')

    // Character-for-character passthrough of the SERVER string.
    const messageEl = summaryMessageElement()
    expect(messageEl).not.toBeNull()
    expect(messageEl?.textContent).toBe(SERVER_MESSAGE)

    // No local re-assembly: narrative/mission fragments never render.
    expect(screen.queryByText(LOCAL_NARRATIVE)).toBeNull()
    expect(screen.queryByText(LOCAL_MISSION)).toBeNull()

    // The sent_at line stays at the bottom of the card.
    expect(
      screen.getByText(i18n.t('admin.review.sentAt', { date: formatDate(SENT_REPORT.sent_at) })),
    ).toBeInTheDocument()
  })

  it('while the fetch is pending the card shows "-" and swaps in the message on resolve', async () => {
    const { promise, resolve } = Promise.withResolvers<{ message: string }>()
    vi.mocked(reportService.getMessage).mockReturnValue(promise)
    setup()

    renderPage()
    await flush()

    expect(reportService.getMessage).toHaveBeenCalledTimes(1)
    expect(summaryMessageElement()?.textContent).toBe('-')

    await act(async () => {
      resolve({ message: SERVER_MESSAGE })
    })
    await flush()

    expect(summaryMessageElement()?.textContent).toBe(SERVER_MESSAGE)
  })

  it('a failed fetch degrades to "-" without breaking the page', async () => {
    vi.mocked(reportService.getMessage).mockRejectedValue(new Error('network down'))
    setup()

    renderPage()
    await flush()

    expect(reportService.getMessage).toHaveBeenCalledWith('r-1')
    expect(summaryMessageElement()?.textContent).toBe('-')
    expect(screen.getByText(i18n.t('admin.review.sentSummaryTitle'))).toBeInTheDocument()
    // The rest of the review page still renders (no crash, no error page).
    expect(screen.getAllByText('Budi').length).toBeGreaterThan(0)
  })
})
