import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { act } from 'react'
import { renderHook } from './test-utils'
import { i18n } from '@/core/i18n'
import { ApiError } from '@/core/services/backend-client'
import { useToastStore } from '@/core/stores/toastStore'
import type { Toast } from '@/core/types/toast'

// ── Mocks (registered before importing the hook) ────────────────────────────
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

// Import after mocks are registered.
import { useReportReview } from '@/features/admin/hooks/useReportReview'
import { sessionService } from '@/core/services/sessions'
import { reportService } from '@/core/services/reports'
import { assessmentService } from '@/core/services/assessments'
import { photoService } from '@/core/services/photos'
import { badgeService } from '@/core/services/badges'
import { missionService } from '@/core/services/missions'
import { programService } from '@/core/services/programs'
import { programSubstageService } from '@/core/services/program-substages'
import { useAuth } from '@/core/hooks/useAuth'
import * as backendClient from '@/core/services/backend-client'

/** Minimal openSSE double: records listeners, exposes close + fire(event). */
interface FakeSource {
  target: EventTarget
  close: Mock
}

function stubOpenSSE() {
  const created: FakeSource[] = []
  const openSSEMock = vi.fn((): EventSource => {
    const target = new EventTarget()
    const close = vi.fn()
    const source = { target, close } as unknown as EventSource
    // Route addEventListener/close through the EventTarget double.
    source.addEventListener = target.addEventListener.bind(target) as EventSource['addEventListener']
    source.removeEventListener = target.removeEventListener.bind(target) as EventSource['removeEventListener']
    source.close = close
    created.push({ target, close })
    return source
  })
  vi.spyOn(backendClient, 'openSSE').mockImplementation(openSSEMock)
  return created
}

function fire(source: FakeSource, type: string, data: unknown): void {
  source.target.dispatchEvent(
    new MessageEvent(type, { data: typeof data === 'string' ? data : JSON.stringify(data) }),
  )
}

const sess = {
  id: 's-1',
  program_id: 'p1',
  name: 'Sesi',
  session_date: '2026-09-30',
  status: 'ACTIVE',
  groups: [],
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

const report = {
  id: 'r-1',
  participant_id: 'c-1',
  session_id: 's-1',
  program_stage_id: 'ps1',
  status: 'DRAFT',
  ai_narrative_draft: 'draf awal',
  mission_ids: [] as string[],
}

function mockHappyPath() {
  vi.mocked(sessionService.getById).mockResolvedValue(sess as never)
  vi.mocked(sessionService.getStages).mockResolvedValue([
    { id: 'ss1', session_id: 's-1', program_stage_id: 'ps1' },
  ] as never)
  vi.mocked(sessionService.getSubstages).mockResolvedValue([] as never)
  vi.mocked(sessionService.getParticipants).mockResolvedValue([participant] as never)
  vi.mocked(reportService.getBySession).mockResolvedValue({ items: [report] } as never)
  vi.mocked(assessmentService.getBySession).mockResolvedValue([] as never)
  vi.mocked(photoService.getBySession).mockResolvedValue([] as never)
  vi.mocked(photoService.getReportPicks).mockResolvedValue([] as never)
  vi.mocked(badgeService.listByParticipant).mockResolvedValue([] as never)
  vi.mocked(missionService.getByTopic).mockResolvedValue([] as never)
  vi.mocked(programService.getById).mockResolvedValue({ id: 'p1', name: 'KIDVERSA' } as never)
  vi.mocked(programService.getStages).mockResolvedValue([
    { id: 'ps1', program_id: 'p1', name: 'Topik 1', sequence_order: 1 },
  ] as never)
  vi.mocked(programSubstageService.listByStage).mockResolvedValue([] as never)
}

async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => { })
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useToastStore.setState({ toasts: [] })
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Admin', role: 'ADMIN' } } as never)
  mockHappyPath()
})

describe('useReportReview.handleGenerateNarrative — stream lifecycle (AR-10)', () => {
  it('POST reject → pre-opened source closed, text restored, error toast (no orphan)', async () => {
    const created = stubOpenSSE()
    const failure = new ApiError('kick-off gagal', 'generate_failed', 500)
    vi.mocked(reportService.generateNarrativeStream).mockRejectedValue(failure)

    const { result } = renderHook(() => useReportReview('s-1', 'c-1'))
    await flush()
    expect(result.current.report?.id).toBe('r-1')

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.handleGenerateNarrative()
    })

    expect(ok).toBe(false)
    expect(created).toHaveLength(1)
    expect(created[0].close).toHaveBeenCalledTimes(1)
    // Draft text restored, streaming flag cleared.
    expect(result.current.narrativeText).toBe('draf awal')
    expect(result.current.streaming).toBe(false)
    const toasts = useToastStore.getState().toasts
    expect(toasts.some((t: Toast) => t.type === 'error')).toBe(true)
  })

  it('done event → source closed, success toast, full text applied', async () => {
    const created = stubOpenSSE()
    vi.mocked(reportService.generateNarrativeStream).mockResolvedValue(undefined)

    const { result } = renderHook(() => useReportReview('s-1', 'c-1'))
    await flush()

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.handleGenerateNarrative()
    })
    expect(ok).toBe(true)
    expect(created).toHaveLength(1)

    await act(async () => {
      fire(created[0], 'done', { full: 'narasi final' })
    })

    expect(created[0].close).toHaveBeenCalledTimes(1)
    expect(result.current.narrativeText).toBe('narasi final')
    expect(result.current.streaming).toBe(false)
    const toasts = useToastStore.getState().toasts
    expect(
      toasts.some(
        (t: Toast) => t.type === 'success' && t.message === i18n.t('admin.reportReview.narrativeDone'),
      ),
    ).toBe(true)
  })

  it('server error event → source closed, text restored (fast-failure observability preserved)', async () => {
    const created = stubOpenSSE()
    vi.mocked(reportService.generateNarrativeStream).mockResolvedValue(undefined)

    const { result } = renderHook(() => useReportReview('s-1', 'c-1'))
    await flush()

    await act(async () => {
      await result.current.handleGenerateNarrative()
    })
    expect(created).toHaveLength(1)

    await act(async () => {
      fire(created[0], 'error', { code: 'quota_exceeded', message: 'kuota habis' })
    })

    expect(created[0].close).toHaveBeenCalledTimes(1)
    expect(result.current.narrativeText).toBe('draf awal')
    expect(result.current.streaming).toBe(false)
    // The server-provided message reaches the user (not swallowed).
    const toasts = useToastStore.getState().toasts
    expect(toasts.some((t: Toast) => t.type === 'error' && t.message === 'kuota habis')).toBe(true)
  })
})
