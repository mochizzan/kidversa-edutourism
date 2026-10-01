import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'

// ── Mocks (registered before importing the hook) ──────────────────────────
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
import { sessionService } from '@/core/services/sessions'
import { reportService } from '@/core/services/reports'
import { assessmentService } from '@/core/services/assessments'
import { photoService } from '@/core/services/photos'
import { badgeService } from '@/core/services/badges'
import { missionService } from '@/core/services/missions'
import { programService } from '@/core/services/programs'
import { programSubstageService } from '@/core/services/program-substages'
import { captureRaportAsPdf } from '@/core/utils/raportCapture'
import { useAuth } from '@/core/hooks/useAuth'
import { useToastStore } from '@/core/stores/toastStore'
import QRCode from 'qrcode'

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

const baseReport = {
  id: 'r-1',
  participant_id: 'c-1',
  program_stage_id: 'ps1',
  status: 'DRAFT',
  mission_ids: [] as string[],
}

// Label & pesan (bahasa 'id' dipaksa oleh vitest.setup.ts).
const PDF_BUTTON = 'UNDUH PDF'
const QR_PLACEHOLDER = '[ QR CODE ]'
const ERRORS_DEFAULT_TOAST = 'Terjadi kesalahan. Silakan coba lagi.'
const PDF_ERROR_TOAST = 'Gagal menghasilkan file PDF.'
const QR_DATA_URL = 'data:image/png;base64,QQ'

function Harness() {
  const hook = useReportReview('s-1', 'c-1')
  return (
    <div>
      <span data-testid="loading">{hook.loading ? 'loading' : 'ready'}</span>
      <button type="button" onClick={() => void hook.handleDownloadPdf()}>
        {PDF_BUTTON}
      </button>
    </div>
  )
}

async function renderHook() {
  const result = render(<Harness />)
  // Flush the full loadData chain (all services are mocked-resolved).
  await act(async () => { })
  expect(screen.getByTestId('loading')).toHaveTextContent('ready')
  return result
}

/** Klik Unduh PDF → buildRaportHtml → ensureGalleryToken → QR → capture. */
async function downloadPdf() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: PDF_BUTTON }))
  })
}

function toastMessages(type?: string) {
  return useToastStore
    .getState()
    .toasts.filter((t) => !type || t.type === type)
    .map((t) => t.message)
}

function builtHtml(): string {
  expect(captureRaportAsPdf).toHaveBeenCalledTimes(1)
  return vi.mocked(captureRaportAsPdf).mock.calls[0][0] as string
}

function mockHappyPath(report: typeof baseReport) {
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

describe('useReportReview — QR galeri: setiap kegagalan terlihat & tercatat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Admin', role: 'ADMIN' } } as never)
    useToastStore.setState({ toasts: [] })
    // vi.mocked memilih overload callback qrcode ((…) => void) — cast agar
    // nilai runtime tetap Promise<string> seperti varian Promise aslinya.
    vi.mocked(QRCode.toDataURL).mockResolvedValue(QR_DATA_URL as never)
    mockHappyPath(baseReport)
  })

  it('ensureGalleryToken rejects → logged + toast with cause + template placeholder + no unhandled failure', async () => {
    const failure = new Error('mint gagal')
    vi.mocked(reportService.ensureGalleryToken).mockRejectedValue(failure)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

    try {
      await renderHook()
      await downloadPdf()

      // Log dengan sebab…
      expect(errorSpy).toHaveBeenCalledWith('[useReportReview.ensureGalleryToken]', failure)
      // …pesan pengguna berisi sebab yang sama…
      expect(toastMessages('error')).toContain('mint gagal')
      // …build tetap selesai: placeholder template sebagai degradasi terakhir
      // (bukan halaman gagal — pdfError TIDAK muncul = tidak ada rejection).
      const html = builtHtml()
      expect(html).toContain(QR_PLACEHOLDER)
      expect(html).toContain('MISI RUMAH BERSAMA KELUARGA')
      expect(toastMessages('error')).not.toContain(PDF_ERROR_TOAST)
      expect(QRCode.toDataURL).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('ensure resolves a report WITHOUT a token → warn + toast, placeholder remains', async () => {
    vi.mocked(reportService.ensureGalleryToken).mockResolvedValue(
      { ...baseReport, gallery_access_token: undefined } as never,
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })

    try {
      await renderHook()
      await downloadPdf()

      expect(warnSpy).toHaveBeenCalledWith(
        '[useReportReview] gallery QR data missing for report',
        'r-1',
      )
      expect(toastMessages('error')).toContain(ERRORS_DEFAULT_TOAST)
      expect(builtHtml()).toContain(QR_PLACEHOLDER)
      expect(QRCode.toDataURL).not.toHaveBeenCalled()
      expect(toastMessages('error')).not.toContain(PDF_ERROR_TOAST)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('ensure rejects while a STALE token exists → still toasts (never silent), QR keeps old token', async () => {
    const failure = new Error('network down')
    vi.mocked(reportService.getBySession).mockResolvedValue(
      { items: [{ ...baseReport, gallery_access_token: 'old-token' }] } as never,
    )
    vi.mocked(reportService.ensureGalleryToken).mockRejectedValue(failure)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

    try {
      await renderHook()
      await downloadPdf()

      // Toast meski token lama masih tersisa — kegagalan mint tidak senyap.
      expect(errorSpy).toHaveBeenCalledWith('[useReportReview.ensureGalleryToken]', failure)
      expect(toastMessages('error')).toContain('network down')
      // QR tetap dibangun dari token lama (degradasi terkontrol).
      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        expect.stringContaining('token=old-token'),
        expect.anything(),
      )
      expect(builtHtml()).toContain(QR_DATA_URL)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('QRCode.toDataURL rejects → logged warn, placeholder renders, no crash', async () => {
    vi.mocked(reportService.ensureGalleryToken).mockResolvedValue(
      { ...baseReport, gallery_access_token: 'tok-1' } as never,
    )
    const failure = new Error('bad qr payload')
    vi.mocked(QRCode.toDataURL).mockRejectedValue(failure)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { })

    try {
      await renderHook()
      await downloadPdf()

      expect(warnSpy).toHaveBeenCalledWith(
        '[useReportReview] gallery QR generation failed',
        failure,
      )
      expect(builtHtml()).toContain(QR_PLACEHOLDER)
      // Encode QR gagal BUKAN kegagalan rapor: tanpa toast error.
      expect(toastMessages('error')).toHaveLength(0)
      expect(toastMessages('error')).not.toContain(PDF_ERROR_TOAST)
    } finally {
      warnSpy.mockRestore()
    }
  })
})
