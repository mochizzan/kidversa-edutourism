import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'
import { i18n } from '@/core/i18n'
import { ReportStatus } from '@/core/types/enums'
import type { Report } from '@/core/types'

// ── Mocks (registered before importing the hook/component) ────────────────
vi.mock('@/core/services/sessions', () => ({
  sessionService: {
    getById: vi.fn(),
    getStages: vi.fn(),
    getSubstages: vi.fn(),
    getParticipants: vi.fn(),
  },
}))

vi.mock('@/core/services/reports', () => ({
  reportService: {
    getBySession: vi.fn(),
    ensureGalleryToken: vi.fn(),
    saveMissions: vi.fn(),
    approve: vi.fn(),
    send: vi.fn(),
    suggestMissions: vi.fn(),
    generateNarrativeStream: vi.fn(),
  },
}))

vi.mock('@/core/services/assessments', () => ({
  assessmentService: { getBySession: vi.fn() },
}))

vi.mock('@/core/services/photos', () => ({
  photoService: { getBySession: vi.fn(), getReportPicks: vi.fn() },
}))

vi.mock('@/core/services/badges', () => ({
  badgeService: { listByParticipant: vi.fn() },
}))

vi.mock('@/core/services/missions', () => ({
  missionService: { getAll: vi.fn(), getByTopic: vi.fn() },
}))

vi.mock('@/core/services/programs', () => ({
  programService: { getById: vi.fn(), getStages: vi.fn() },
}))

vi.mock('@/core/services/program-substages', () => ({
  programSubstageService: { listByStage: vi.fn() },
}))

vi.mock('@/core/utils/raportCapture', () => ({
  captureRaportAsPdf: vi.fn(),
  captureRaportAsBlob: vi.fn(),
  downloadBlob: vi.fn(),
}))

vi.mock('@/core/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/core/hooks/useTenantScope', () => ({
  useTenantScope: vi.fn(() => ({ tenantId: null })),
}))

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn() },
}))

// Import after mocks are registered
import { useReportReview } from '@/features/admin/hooks/useReportReview'
import { ReportStatusBanner } from '@/features/admin/components/ReportStatusBanner'
import { sessionService } from '@/core/services/sessions'
import { reportService } from '@/core/services/reports'
import { assessmentService } from '@/core/services/assessments'
import { photoService } from '@/core/services/photos'
import { badgeService } from '@/core/services/badges'
import { missionService } from '@/core/services/missions'
import { programService } from '@/core/services/programs'
import { programSubstageService } from '@/core/services/program-substages'
import { useAuth } from '@/core/hooks/useAuth'

// ── Fixtures ──────────────────────────────────────────────────────────────
const SENT_TOKEN = 'tok-parent-64hex'

const sess = {
  id: 's-1',
  program_id: 'p1',
  name: 'Sesi',
  session_date: '2026-09-30',
  status: 'ACTIVE',
  groups: [
    {
      id: 'g-1',
      name: 'Kelompok A',
      status: 'COMPLETED',
      facilitator_name: 'Bu Sari',
      current_session_stage_id: 'ss1',
    },
  ],
}

const participant = {
  id: 'c-1',
  session_id: 's-1',
  group_id: 'g-1',
  child_name: 'Budi',
  child_age: 7,
  school_name: 'SD Satu',
  consent_photo: true,
}

const mkReport = (status: ReportStatus, parentAccessToken: string): Report => ({
  id: 'r-1',
  participant_id: 'c-1',
  session_id: 's-1',
  program_stage_id: 'ps1',
  status,
  parent_access_token: parentAccessToken,
  mission_ids: [] as string[],
})

/** Label sesuai pemakaian asli di banner (i18n 'id' dipaksa vitest.setup.ts). */
const COPY_LINK = () => i18n.t('admin.reports.copyLink')
const OPEN_PARENT = () => i18n.t('admin.reports.openParentPage')
const SEND_TRIGGER = 'TRIGGER_KIRIM'

function mockHappyPath(report: Report) {
  vi.mocked(sessionService.getById).mockResolvedValue(sess as never)
  vi.mocked(sessionService.getStages).mockResolvedValue([
    { id: 'ss1', session_id: 's-1', program_stage_id: 'ps1' },
  ] as never)
  vi.mocked(sessionService.getSubstages).mockResolvedValue([] as never)
  vi.mocked(sessionService.getParticipants).mockResolvedValue([participant] as never)
  vi.mocked(reportService.getBySession).mockResolvedValue({ items: [report] } as never)
  vi.mocked(reportService.saveMissions).mockResolvedValue({} as never)
  vi.mocked(assessmentService.getBySession).mockResolvedValue([] as never)
  vi.mocked(photoService.getBySession).mockResolvedValue([] as never)
  vi.mocked(photoService.getReportPicks).mockResolvedValue([] as never)
  vi.mocked(badgeService.listByParticipant).mockResolvedValue([] as never)
  vi.mocked(missionService.getAll).mockResolvedValue({ data: [] } as never)
  vi.mocked(missionService.getByTopic).mockResolvedValue([] as never)
  vi.mocked(programService.getById).mockResolvedValue({ id: 'p1', name: 'KIDVERSA' } as never)
  vi.mocked(programService.getStages).mockResolvedValue([
    { id: 'ps1', program_id: 'p1', name: 'Topik 1', sequence_order: 1 },
  ] as never)
  vi.mocked(programSubstageService.listByStage).mockResolvedValue([] as never)
}

function Harness() {
  const hook = useReportReview('s-1', 'c-1')
  return (
    <div>
      <span data-testid="loading">{hook.loading ? 'loading' : 'ready'}</span>
      <button type="button" onClick={() => void hook.handleSend()}>
        {SEND_TRIGGER}
      </button>
      {hook.report && (
        <ReportStatusBanner report={hook.report} copiedLink={false} onCopyLink={() => { }} />
      )}
    </div>
  )
}

/** Flush penuh rantai loadData (semua service mocked-resolved). */
async function flush(rounds = 2): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => { })
  }
}

async function clickSend(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: SEND_TRIGGER }))
  })
  await flush()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Admin', role: 'ADMIN' } } as never)
})

describe('ReportStatusBanner — aksi link orang tua hanya saat token ADA', () => {
  const renderBanner = (report: Report) =>
    render(<ReportStatusBanner report={report} copiedLink={false} onCopyLink={() => { }} />)

  it('SENT + token → merender tautan, salin, dan buka halaman orang tua', () => {
    renderBanner(mkReport(ReportStatus.SENT, SENT_TOKEN))

    expect(screen.getByText(new RegExp(`token=${SENT_TOKEN}`))).toBeInTheDocument()
    expect(screen.getByText(COPY_LINK())).toBeInTheDocument()
    expect(screen.getByText(OPEN_PARENT())).toBeInTheDocument()
  })

  it('SENT tanpa token → aksi TIDAK dirender (fallback: baris status saja)', () => {
    renderBanner(mkReport(ReportStatus.SENT, ''))

    expect(screen.queryByText(COPY_LINK())).toBeNull()
    expect(screen.queryByText(OPEN_PARENT())).toBeNull()
    expect(
      screen.getByText(i18n.t('admin.reports.statusSent', { date: '-' })),
    ).toBeInTheDocument()
  })

  it('bukan SENT → aksi tidak dirender meski token tersimpan', () => {
    renderBanner(mkReport(ReportStatus.APPROVED, SENT_TOKEN))

    expect(screen.queryByText(COPY_LINK())).toBeNull()
    expect(screen.queryByText(OPEN_PARENT())).toBeNull()
  })
})

describe('useReportReview — token masuk state sehingga banner merender aksi', () => {
  it('token dari respons BACA (GET /api/reports) → state memuatnya → banner merender aksi', async () => {
    mockHappyPath(mkReport(ReportStatus.SENT, SENT_TOKEN))

    render(<Harness />)
    await flush()

    expect(screen.getByTestId('loading')).toHaveTextContent('ready')
    expect(screen.getByText(new RegExp(`token=${SENT_TOKEN}`))).toBeInTheDocument()
    expect(screen.getByText(COPY_LINK())).toBeInTheDocument()
    expect(screen.getByText(OPEN_PARENT())).toBeInTheDocument()
  })

  it('token dari respons /send disimpan ke state, bahkan bila daftar ulang tak membawanya', async () => {
    // Daftar ulang TIDAK membawa token → satu-satunya sumber = respons /send.
    mockHappyPath(mkReport(ReportStatus.SENT, ''))
    vi.mocked(reportService.send).mockResolvedValue({
      id: 'r-1',
      parent_access_token: SENT_TOKEN,
      status: 'SENT',
    } as never)

    render(<Harness />)
    await flush()

    // Tanpa token → aksi memang tidak ada (kondisional benar).
    expect(screen.queryByText(COPY_LINK())).toBeNull()

    await clickSend()

    expect(reportService.send).toHaveBeenCalledWith('r-1', undefined)
    expect(screen.getByText(new RegExp(`token=${SENT_TOKEN}`))).toBeInTheDocument()
    expect(screen.getByText(COPY_LINK())).toBeInTheDocument()
    expect(screen.getByText(OPEN_PARENT())).toBeInTheDocument()
  })

  it('token kosong di kedua sumber → aksi tetap tidak dirender setelah send', async () => {
    mockHappyPath(mkReport(ReportStatus.SENT, ''))
    vi.mocked(reportService.send).mockResolvedValue({
      id: 'r-1',
      parent_access_token: '',
      status: 'SENT',
    } as never)

    render(<Harness />)
    await flush()
    await clickSend()

    expect(screen.queryByText(COPY_LINK())).toBeNull()
    expect(screen.queryByText(OPEN_PARENT())).toBeNull()
  })
})
