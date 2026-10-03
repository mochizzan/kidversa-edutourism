import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'

// ── Mocks (registered before importing the hook/components) ───────────────
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
import { ReportAssessmentScores } from '@/features/admin/components/ReportAssessmentScores'
import { ReportMissionSelector } from '@/features/admin/components/ReportMissionSelector'
import { BadgeList } from '@/shared/components/data/BadgeList'
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
import QRCode from 'qrcode'
import type { MissionBank, ParticipantBadge, ProgramSubstage } from '@/core/types'

// ── Fixtures: program dengan 3 topik (Kebakaran / Gempa / Banjir) ─────────

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

const REPORTS = [
  { id: 'r-1', participant_id: 'c-1', program_stage_id: 'ps1', status: 'DRAFT', mission_ids: [] as string[] },
  { id: 'r-2', participant_id: 'c-1', program_stage_id: 'ps2', status: 'DRAFT', mission_ids: [] as string[] },
  { id: 'r-3', participant_id: 'c-1', program_stage_id: 'ps3', status: 'DRAFT', mission_ids: [] as string[] },
]

const SESSION_STAGES = [
  { id: 'ss1', session_id: 's-1', program_stage_id: 'ps1' },
  { id: 'ss2', session_id: 's-1', program_stage_id: 'ps2' },
  { id: 'ss3', session_id: 's-1', program_stage_id: 'ps3' },
]

const SESSION_SUBSTAGES = [
  {
    id: 'sub-1',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    session_id: 's-1',
    session_stage_id: 'ss1',
    program_substage_id: 'psub-1',
    status: 'COMPLETED',
  },
  {
    id: 'sub-2',
    created_at: '2026-09-02T00:00:00Z',
    updated_at: '2026-09-02T00:00:00Z',
    session_id: 's-1',
    session_stage_id: 'ss2',
    program_substage_id: 'psub-2',
    status: 'COMPLETED',
  },
  {
    id: 'sub-3',
    created_at: '2026-09-03T00:00:00Z',
    updated_at: '2026-09-03T00:00:00Z',
    session_id: 's-1',
    session_stage_id: 'ss3',
    program_substage_id: 'psub-3',
    status: 'COMPLETED',
  },
]

// Topik 1 dinilai (rating 3); topik 2 tanpa baris assessment; topik 3 rating 0 (absent).
const ASSESSMENTS = [
  { id: 'a-1', participant_id: 'c-1', session_substage_id: 'sub-1', star_rating: 3, comment: 'Aman' },
  { id: 'a-3', participant_id: 'c-1', session_substage_id: 'sub-3', star_rating: 0 },
]

const PROGRAM_STAGES = [
  { id: 'ps1', program_id: 'p1', name: 'Kebakaran', sequence_order: 1 },
  { id: 'ps2', program_id: 'p1', name: 'Gempa', sequence_order: 2 },
  { id: 'ps3', program_id: 'p1', name: 'Banjir', sequence_order: 3 },
]

const PROGRAM_SUBSTAGES: Record<string, ProgramSubstage[]> = {
  ps1: [
    {
      id: 'psub-1',
      program_stage_id: 'ps1',
      name: 'Kegiatan Kebakaran A',
      sequence_order: 1,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    },
  ],
  ps2: [
    {
      id: 'psub-2',
      program_stage_id: 'ps2',
      name: 'Kegiatan Gempa A',
      sequence_order: 1,
      created_at: '2026-09-02T00:00:00Z',
      updated_at: '2026-09-02T00:00:00Z',
    },
  ],
  ps3: [
    {
      id: 'psub-3',
      program_stage_id: 'ps3',
      name: 'Kegiatan Banjir A',
      sequence_order: 1,
      created_at: '2026-09-03T00:00:00Z',
      updated_at: '2026-09-03T00:00:00Z',
    },
  ],
}

const mission = (id: string, title: string): MissionBank => ({
  id,
  program_id: 'p1',
  title,
  is_active: true,
  created_at: '2026-09-01T00:00:00Z',
})

const MISSIONS_BY_TOPIC: Record<string, MissionBank[]> = {
  ps1: [mission('m1', 'Misi Kebakaran')],
  ps2: [mission('m2', 'Misi Gempa')],
  ps3: [mission('m3', 'Misi Banjir')],
}

const BADGES: ParticipantBadge[] = [
  {
    id: 'b-1',
    participant_id: 'c-1',
    program_id: 'p1',
    program_stage_id: 'ps1',
    badge_type: 'SUBTOPIK',
    badge_name: 'Badge Kebakaran',
    badge_image_url: 'badges/kebakaran.png',
    awarded_at: '2026-09-01T00:00:00Z',
  },
  {
    id: 'b-2',
    participant_id: 'c-1',
    program_id: 'p1',
    program_stage_id: 'ps2',
    badge_type: 'SUBTOPIK',
    badge_name: 'Badge Gempa',
    badge_image_url: 'badges/gempa.png',
    awarded_at: '2026-09-02T00:00:00Z',
  },
  {
    id: 'b-3',
    participant_id: 'c-1',
    program_id: 'p1',
    program_stage_id: 'ps3',
    badge_type: 'SUBTOPIK',
    badge_name: 'Badge Banjir',
    badge_image_url: 'badges/banjir.png',
    awarded_at: '2026-09-03T00:00:00Z',
  },
  {
    id: 'b-4',
    participant_id: 'c-1',
    program_id: 'p1',
    program_stage_id: null,
    badge_type: 'FINAL',
    badge_name: 'Badge Final',
    badge_image_url: 'badges/final.png',
    awarded_at: '2026-09-04T00:00:00Z',
  },
]

// Label (bahasa 'id' dipaksa oleh vitest.setup.ts).
const PDF_BUTTON = 'UNDUH PDF'
const LIBRARY_BUTTON = 'Pilih dari library misi'
const QR_DATA_URL = 'data:image/png;base64,QQ'

type Fixture = 'multi' | 'single'

function setupMocks(fixture: Fixture) {
  const sessionStages = fixture === 'multi' ? SESSION_STAGES : SESSION_STAGES.slice(0, 1)
  const sessionSubstages = fixture === 'multi' ? SESSION_SUBSTAGES : SESSION_SUBSTAGES.slice(0, 1)
  // Sesi topik tunggal: report hanya ps1 dan sudah punya misi terpilih (m1)
  // agar alur pemilihan misi ikut teregresi.
  const reports =
    fixture === 'multi' ? REPORTS : [{ ...REPORTS[0], mission_ids: ['m1'] as string[] }]

  vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Admin', role: 'ADMIN' } } as never)
  vi.mocked(QRCode.toDataURL).mockResolvedValue(QR_DATA_URL as never)
  vi.mocked(reportService.ensureGalleryToken).mockResolvedValue(
    { gallery_access_token: 'tok-1' } as never,
  )
  vi.mocked(sessionService.getById).mockResolvedValue(sess as never)
  vi.mocked(sessionService.getStages).mockResolvedValue(sessionStages as never)
  vi.mocked(sessionService.getSubstages).mockResolvedValue(sessionSubstages as never)
  vi.mocked(sessionService.getParticipants).mockResolvedValue([participant] as never)
  vi.mocked(reportService.getBySession).mockResolvedValue({ items: reports } as never)
  vi.mocked(reportService.saveMissions).mockResolvedValue({} as never)
  vi.mocked(assessmentService.getBySession).mockResolvedValue(ASSESSMENTS as never)
  vi.mocked(photoService.getBySession).mockResolvedValue([] as never)
  vi.mocked(photoService.getReportPicks).mockResolvedValue([] as never)
  vi.mocked(badgeService.listByParticipant).mockResolvedValue(BADGES as never)
  vi.mocked(missionService.getAll).mockResolvedValue({ data: [] } as never)
  vi.mocked(missionService.getByTopic).mockImplementation(
    async (topicId: string) => MISSIONS_BY_TOPIC[topicId] ?? [],
  )
  vi.mocked(programService.getById).mockResolvedValue({ id: 'p1', name: 'KIDVERSA' } as never)
  vi.mocked(programService.getStages).mockResolvedValue(PROGRAM_STAGES as never)
  vi.mocked(programSubstageService.listByStage).mockImplementation(
    async (stageId: string) => PROGRAM_SUBSTAGES[stageId] ?? [],
  )
}

/** Harness: hook + ketiga section yang wajib mengikuti topik aktif. */
function Harness() {
  const hook = useReportReview('s-1', 'c-1')
  return (
    <div>
      <span data-testid="loading">{hook.loading ? 'loading' : 'ready'}</span>
      <span data-testid="active-topic">{hook.activeTopicId ?? ''}</span>
      <span data-testid="topic-tabs">{hook.topics.map((t) => t.name).join('|')}</span>
      <span data-testid="stage-rows">{hook.stageInfos.map((s) => s.programStage.name).join('|')}</span>
      <span data-testid="kegiatan-rows">
        {hook.stageInfos.flatMap((s) => s.kegiatan.map((k) => k.programSubstageName)).join('|')}
      </span>
      <span data-testid="has-no-assessment">{String(hook.hasNoAssessment)}</span>
      <span data-testid="mission-titles">{hook.missions.map((m) => m.title).join('|')}</span>
      <div>
        {hook.topics.map((t) => (
          <button
            key={t.programStageId}
            type="button"
            onClick={() => hook.setActiveTopicId(t.programStageId)}
          >
            {`switch-${t.name}`}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => void hook.handleDownloadPdf()}>
        {PDF_BUTTON}
      </button>
      <ReportAssessmentScores stageInfos={hook.stageInfos} />
      <BadgeList participantId="c-1" programStageId={hook.activeTopicId} />
      <ReportMissionSelector
        missions={hook.missions}
        assignedMissionIds={hook.assignedMissionIds}
        onToggleMission={hook.toggleMission}
        onSuggestMissions={hook.handleSuggestMissions}
        suggesting={hook.suggesting}
      />
    </div>
  )
}

async function flush() {
  await act(async () => { })
}

async function renderHarness(fixture: Fixture) {
  setupMocks(fixture)
  render(<Harness />)
  await flush()
  expect(screen.getByTestId('loading')).toHaveTextContent('ready')
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
  await flush()
}

function lastBuiltHtml(): string {
  const calls = vi.mocked(captureRaportAsPdf).mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return calls[calls.length - 1][0] as string
}

function testidText(id: string): string {
  return screen.getByTestId(id).textContent ?? ''
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useReportReview — activeTopicId sebagai sumber tunggal (multi-topik)', () => {
  it('topik awal: hanya stage rows topik itu; mini rapor tanpa "Topik lain" dan tanpa kegiatan topik lain', async () => {
    await renderHarness('multi')

    expect(testidText('topic-tabs')).toBe('Kebakaran|Gempa|Banjir')
    expect(testidText('active-topic')).toBe('ps1')
    expect(testidText('stage-rows')).toBe('Kebakaran')
    expect(testidText('kegiatan-rows')).toBe('Kegiatan Kebakaran A')
    expect(testidText('has-no-assessment')).toBe('false')

    // Tabel assessment hanya menampilkan kegiatan topik aktif.
    expect(screen.getAllByText('Kegiatan Kebakaran A').length).toBeGreaterThan(0)
    expect(screen.queryByText('Kegiatan Gempa A')).toBeNull()
    expect(screen.queryByText('Kegiatan Banjir A')).toBeNull()

    // Mini rapor (print/PDF/PNG lewat buildRaportHtml) pun topik yang sama.
    await click(PDF_BUTTON)
    const html = lastBuiltHtml()
    expect(html).toContain('Kegiatan Kebakaran A')
    expect(html).not.toContain('Kegiatan Gempa A')
    expect(html).not.toContain('Kegiatan Banjir A')
    expect(html).not.toContain('Topik lain')
  })

  it('pindah topik → stage rows, tabel assessment, mini rapor, badge, misi, hasNoAssessment ikut topik aktif', async () => {
    await renderHarness('multi')
    await click('switch-Gempa')

    expect(testidText('active-topic')).toBe('ps2')
    expect(testidText('stage-rows')).toBe('Gempa')
    expect(testidText('kegiatan-rows')).toBe('Kegiatan Gempa A')
    // Topik Gempa tidak dinilai → gate mengikuti topik aktif, bukan gabungan.
    expect(testidText('has-no-assessment')).toBe('true')
    expect(testidText('mission-titles')).toBe('Misi Gempa')

    // Tabel assessment: hanya Gempa.
    expect(screen.getAllByText('Kegiatan Gempa A').length).toBeGreaterThan(0)
    expect(screen.queryByText('Kegiatan Kebakaran A')).toBeNull()
    expect(screen.queryByText('Kegiatan Banjir A')).toBeNull()

    // Kartu badge SUBTOPIK ikut topik aktif; badge FINAL tetap tampil.
    expect(screen.getByText('Badge Gempa')).toBeTruthy()
    expect(screen.queryByText('Badge Kebakaran')).toBeNull()
    expect(screen.queryByText('Badge Banjir')).toBeNull()
    expect(screen.getByText('Badge Final')).toBeTruthy()

    await click(PDF_BUTTON)
    const html = lastBuiltHtml()
    expect(html).toContain('Kegiatan Gempa A')
    expect(html).not.toContain('Kegiatan Kebakaran A')
    expect(html).not.toContain('Kegiatan Banjir A')
    expect(html).not.toContain('Topik lain')
  })

  it('rating 0 (absent) = tidak ada penilaian untuk topik aktif; misi ikut pindah topik', async () => {
    await renderHarness('multi')
    expect(testidText('has-no-assessment')).toBe('false')

    await click('switch-Banjir')
    expect(testidText('has-no-assessment')).toBe('true')
    expect(testidText('kegiatan-rows')).toBe('Kegiatan Banjir A')
    expect(testidText('mission-titles')).toBe('Misi Banjir')
  })

  it('misi: tanpa fetch program-wide; balasan lambat topik lama tidak menimpa topik aktif', async () => {
    let resolvePs1!: (list: MissionBank[]) => void
    const pendingPs1 = new Promise<MissionBank[]>((resolve) => {
      resolvePs1 = resolve
    })
    await renderHarness('multi')
    vi.mocked(missionService.getByTopic).mockImplementation((topicId: string) => {
      if (topicId === 'ps1') return pendingPs1
      return Promise.resolve(MISSIONS_BY_TOPIC[topicId] ?? [])
    })

    // Fetch program-wide dihilangkan — daftar misi hanya dari topik (yang untuk
    // ps1 sengaja dibuat lambat di bawah), jadi tidak ada data program yang bocor.
    expect(missionService.getAll).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: PDF_BUTTON }))
    })
    await flush()
    expect(missionService.getByTopic).toHaveBeenCalledWith('ps1', { limit: 100 })

    // Pindah topik: ps2 muat duluan.
    await click('switch-Gempa')
    expect(testidText('mission-titles')).toBe('Misi Gempa')

    // Balasan lambat ps1 tiba SETELAH admin pindah → harus diabaikan.
    await act(async () => {
      resolvePs1(MISSIONS_BY_TOPIC.ps1)
    })
    await flush()
    expect(testidText('mission-titles')).toBe('Misi Gempa')
    expect(missionService.getAll).not.toHaveBeenCalled()
  })

  it('library modal hanya berisi misi topik aktif', async () => {
    await renderHarness('multi')
    await click('switch-Banjir')
    await click(LIBRARY_BUTTON)

    expect(screen.getByText('Pilih dari Library Misi')).toBeTruthy()
    expect(screen.getAllByText('Misi Banjir').length).toBeGreaterThan(0)
    expect(screen.queryByText('Misi Kebakaran')).toBeNull()
    expect(screen.queryByText('Misi Gempa')).toBeNull()
  })
})

describe('BadgeList — scope topik opsional', () => {
  it('tanpa programStageId (pemakaian parent): semua badge topik tetap tampil', async () => {
    setupMocks('multi')
    render(<BadgeList participantId="c-1" />)
    await flush()

    expect(screen.getByText('Badge Kebakaran')).toBeTruthy()
    expect(screen.getByText('Badge Gempa')).toBeTruthy()
    expect(screen.getByText('Badge Banjir')).toBeTruthy()
    expect(screen.getByText('Badge Final')).toBeTruthy()
  })

  it('dengan programStageId: hanya badge topik itu + FINAL yang tampil', async () => {
    setupMocks('multi')
    render(<BadgeList participantId="c-1" programStageId="ps1" />)
    await flush()

    expect(screen.getByText('Badge Kebakaran')).toBeTruthy()
    expect(screen.getByText('Badge Final')).toBeTruthy()
    expect(screen.queryByText('Badge Gempa')).toBeNull()
    expect(screen.queryByText('Badge Banjir')).toBeNull()
  })

  it('scope topik tanpa badge SUBTOPIK dan tanpa FINAL → empty-state, bukan kartu kosong', async () => {
    setupMocks('multi')
    vi.mocked(badgeService.listByParticipant).mockResolvedValue([BADGES[0]] as never)
    render(<BadgeList participantId="c-1" programStageId="ps2" />)
    await flush()

    expect(screen.getByText('Belum ada badge yang diraih.')).toBeTruthy()
    expect(screen.queryByText('Badge Kebakaran')).toBeNull()
  })
})

describe('useReportReview — regresi sesi topik tunggal', () => {
  it('satu tab, satu stage row, misi scope-topik, dan alur pemilihan misi tetap berfungsi', async () => {
    await renderHarness('single')

    expect(testidText('topic-tabs')).toBe('Kebakaran')
    expect(screen.getAllByRole('button', { name: /^switch-/ })).toHaveLength(1)
    expect(testidText('stage-rows')).toBe('Kebakaran')
    expect(testidText('kegiatan-rows')).toBe('Kegiatan Kebakaran A')
    expect(testidText('has-no-assessment')).toBe('false')
    expect(testidText('mission-titles')).toBe('Misi Kebakaran')
    expect(missionService.getAll).not.toHaveBeenCalled()
    expect(missionService.getByTopic).toHaveBeenCalledWith('ps1', { limit: 100 })

    // Mini rapor tetap topik tunggal tanpa penanda merge.
    await click(PDF_BUTTON)
    const html = lastBuiltHtml()
    expect(html).toContain('Kegiatan Kebakaran A')
    expect(html).not.toContain('Topik lain')

    // Misi terpilih (report.mission_ids = ['m1']) tampil sebagai chip dari bank
    // topik; melepas chip → empty-state "belum ada misi dipilih".
    expect(screen.getByRole('button', { name: 'Hapus Misi Kebakaran' })).toBeTruthy()
    await click('Hapus Misi Kebakaran')
    expect(screen.getByText(/^Belum ada misi dipilih/)).toBeTruthy()
  })
})

describe('useReportReview — foto mini rapor = pick TOPIK itu (sejajar backend tier)', () => {
  // Foto peserta di dua bucket: ss1 (Kebakaran) berisi foto berflag
  // is_report_photo + galeri terbaru tanpa flag; ss2 (Gempa) berisi foto pick.
  const TOPIC_PHOTOS = [
    {
      id: 'ph-flag',
      participant_id: 'c-1',
      session_id: 's-1',
      session_stage_id: 'ss1',
      original_file_url: 'photos/flag.jpg',
      is_report_photo: true,
      taken_by: 'fac-1',
      taken_at: '2026-09-30T01:00:00Z',
      created_at: '2026-09-30T01:00:00Z',
    },
    {
      id: 'ph-newest-ss1',
      participant_id: 'c-1',
      session_id: 's-1',
      session_stage_id: 'ss1',
      original_file_url: 'photos/newest.jpg',
      is_report_photo: false,
      taken_by: 'fac-1',
      taken_at: '2026-09-30T05:00:00Z',
      created_at: '2026-09-30T05:00:00Z',
    },
    {
      id: 'ph-pick-ps2',
      participant_id: 'c-1',
      session_id: 's-1',
      session_stage_id: 'ss2',
      original_file_url: 'photos/pick2.jpg',
      is_report_photo: false,
      taken_by: 'fac-1',
      taken_at: '2026-09-30T02:00:00Z',
      created_at: '2026-09-30T02:00:00Z',
    },
  ]
  const TOPIC_PICKS = [
    { program_stage_id: 'ps1', photo_id: 'ph-flag' },
    { program_stage_id: 'ps2', photo_id: 'ph-pick-ps2' },
  ]

  it('pick topik aktif yang dirender — bukan galeri terbaru / foto lintas topik', async () => {
    setupMocks('multi')
    vi.mocked(photoService.getBySession).mockResolvedValue(TOPIC_PHOTOS as never)
    vi.mocked(photoService.getReportPicks).mockResolvedValue(TOPIC_PICKS as never)
    render(<Harness />)
    await flush()
    expect(screen.getByTestId('loading')).toHaveTextContent('ready')

    // Topik awal (ps1): pick ps1 menang atas galeri terbaru bucket ss1.
    await click(PDF_BUTTON)
    let html = lastBuiltHtml()
    expect(html).toContain('/api/media/photo/ph-flag')
    expect(html).not.toContain('/api/media/photo/ph-newest-ss1')

    // Pindah Gempa (ps2): pick ps2 dirender — bukan flag/foto topik Kebakaran.
    await click('switch-Gempa')
    await click(PDF_BUTTON)
    html = lastBuiltHtml()
    expect(html).toContain('/api/media/photo/ph-pick-ps2')
    expect(html).not.toContain('/api/media/photo/ph-flag')
    expect(html).not.toContain('/api/media/photo/ph-newest-ss1')
  })

  it('topik tanpa pick dan tanpa foto di bucket-nya → placeholder (bukan flag topik lain)', async () => {
    setupMocks('multi')
    vi.mocked(photoService.getBySession).mockResolvedValue(TOPIC_PHOTOS as never)
    vi.mocked(photoService.getReportPicks).mockResolvedValue(TOPIC_PICKS as never)
    render(<Harness />)
    await flush()
    expect(screen.getByTestId('loading')).toHaveTextContent('ready')

    // Banjir (ps3, bucket ss3) tak ada fotonya: resolusi sesi-lebar lama akan
    // salah menampilkan flag Kebakaran — sekarang placeholder, sejajar server.
    await click('switch-Banjir')
    await click(PDF_BUTTON)
    const html = lastBuiltHtml()
    expect(html).toContain('PLACEHOLDER FOTO ANAK')
    expect(html).not.toContain('/api/media/photo/ph-flag')
    expect(html).not.toContain('/api/media/photo/ph-pick-ps2')
  })
})
