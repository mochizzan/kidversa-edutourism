import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'

// ── Mocks (registered before importing the page) ──────────────────────────
vi.mock('@/core/services/sessions', () => ({
 sessionService: {
  getById: vi.fn(),
  getStages: vi.fn(),
  getParticipantById: vi.fn(),
 },
}))

vi.mock('@/core/services/programs', () => ({
 programService: {
  getStages: vi.fn(),
 },
}))

vi.mock('@/core/services/photos', () => ({
 photoService: {
  getByParticipant: vi.fn(),
  getReportPicks: vi.fn(),
  setReportPick: vi.fn(),
  clearReportPick: vi.fn(),
  delete: vi.fn(),
  upload: vi.fn(),
  update: vi.fn(),
  setReportPhoto: vi.fn(),
 },
}))

vi.mock('@/core/hooks/useAuth', () => ({
 useAuth: vi.fn(),
}))

// Import after mocks are registered
import GaleriChildPage from '@/features/fasilitator/pages/galeri/GaleriChildPage'
import { sessionService } from '@/core/services/sessions'
import { programService } from '@/core/services/programs'
import { photoService } from '@/core/services/photos'
import { useAuth } from '@/core/hooks/useAuth'
import { useToastStore } from '@/core/stores/toastStore'
import { SessionStatus } from '@/core/types/enums'

// i18n is forced to 'id' (source locale) for the whole test run.
const ADD_CARD_LABEL = 'Tambah foto ke topik ini'
const LEGACY_CHIP = 'Foto Lama'
const LEGACY_PICK_REASON =
 'Foto lama tidak terikat topik mana pun — pilihan foto mini rapor hanya tersedia di dalam topik.'
const START_LABEL = 'Pilih Foto Mini Rapor'
const SAVE_LABEL = 'Simpan Pilihan'
const CAMERA_HEADING = 'HALAMAN KAMERA'

const session = {
 id: 's-1',
 tenant_id: 't1',
 program_id: 'p1',
 name: 'Sesi Topik',
 session_date: '2026-09-30',
 location: 'Ruang 1',
 status: SessionStatus.ACTIVE,
 created_by: 'u1',
 created_at: '2026-09-30T01:00:00Z',
}

const group = {
 id: 'g-mine',
 session_id: 's-1',
 name: 'Kelompok A',
 status: 'IN_PROGRESS',
 current_session_stage_id: 'ss1',
 facilitator_id: 'u1',
 created_at: '2026-09-30T01:00:00Z',
}

const detail = { ...session, stages: [], groups: [{ ...group, participants: [] }] }

const participant = {
 id: 'c-1',
 session_id: 's-1',
 group_id: 'g-mine',
 child_name: 'Budi',
 child_age: 7,
 school_name: 'SD Satu',
 parent_phone: '0812',
 consent_photo: true,
 created_at: '2026-09-30T01:00:00Z',
}

const photo = {
 id: 'ph-1',
 participant_id: 'c-1',
 session_id: 's-1',
 original_file_url: '',
 is_report_photo: false,
 taken_by: 'u1',
 taken_at: '2026-09-30T02:00:00Z',
}

/** One gallery photo row as the page sees it (topic bucket included). */
interface TopicPhoto {
 id: string
 participant_id: string
 session_id: string
 session_stage_id: string
 original_file_url: string
 is_report_photo: boolean
 taken_by: string
 taken_at: string
 created_at: string
}

/** N photos of one topic bucket, in server order (created_at DESC simulated). */
function makePhotos(prefix: string, count: number, sessionStageId: string): TopicPhoto[] {
 return Array.from({ length: count }, (_, i) => ({
  ...photo,
  id: `${prefix}-${i + 1}`,
  created_at: `2026-09-30T02:${String(count - 1 - i).padStart(2, '0')}:00:00Z`,
  session_stage_id: sessionStageId,
 }))
}

async function click(el: HTMLElement) {
 await act(async () => {
  fireEvent.click(el)
 })
}

/** Exposes the camera route's query string inside the fake camera screen. */
function CameraSearchProbe() {
 const location = useLocation()
 return <span data-testid="camera-search">{location.search}</span>
}

async function renderChildPage() {
 const result = render(
  <MemoryRouter initialEntries={['/fasilitator/galeri/peserta/c-1']}>
   <Routes>
    <Route path="/fasilitator/galeri/peserta/:childId" element={<GaleriChildPage />} />
    <Route
     path="/fasilitator/groups/:groupId/children/:childId/photo"
     element={
      <div>
       {CAMERA_HEADING}
       <CameraSearchProbe />
      </div>
     }
    />
   </Routes>
  </MemoryRouter>,
 )
 // Flush the full chain: participant → session+stages → topic names →
 // legacy probe + per-topic photo fetch.
 await act(async () => { })
 return result
}

/**
 * Topic-aware photo mock: the legacy probe (session_stage_id='') answers
 * `legacyRows`; every topic fetch is answered from `buckets` by stage id.
 * Any other call shape (e.g. the old session-wide request with NO options)
 * throws, so a regression to the old session-wide fetch fails loudly.
 */
function mockPhotoBuckets(
 buckets: Record<string, TopicPhoto[]>,
 legacyRows: TopicPhoto[] = [],
) {
 vi.mocked(photoService.getByParticipant).mockImplementation(async (_id, opts) => {
  const stageId = opts?.sessionStageId
  if (stageId === undefined) throw new Error('expected a session_stage_id fetch')
  if (stageId === '') return legacyRows
  const rows = buckets[stageId]
  if (!rows) throw new Error(`unexpected topic fetch: ${stageId}`)
  return rows
 })
}

function mockTopics() {
 vi.mocked(sessionService.getParticipantById).mockResolvedValue(participant as never)
 vi.mocked(sessionService.getById).mockResolvedValue(detail as never)
 // Two SESSION stages (ss1 = group current, ss2) — chips key on their ids.
 vi.mocked(sessionService.getStages).mockResolvedValue([
  { id: 'ss1', session_id: 's-1', program_stage_id: 'ps1', status: 'IN_PROGRESS' },
  { id: 'ss2', session_id: 's-1', program_stage_id: 'ps2', status: 'UPCOMING' },
 ] as never)
 vi.mocked(programService.getStages).mockResolvedValue([
  { id: 'ps1', program_id: 'p1', sequence_order: 1, name: 'Topik Satu', content_type: 'TEXT' },
  { id: 'ps2', program_id: 'p1', sequence_order: 2, name: 'Topik Dua', content_type: 'TEXT' },
 ] as never)
 vi.mocked(photoService.getReportPicks).mockResolvedValue([] as never)
}

function resetMocks() {
 vi.clearAllMocks()
 vi.mocked(useAuth).mockReturnValue({
  user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' },
 } as never)
 vi.mocked(photoService.setReportPick).mockResolvedValue(photo as never)
 vi.mocked(photoService.clearReportPick).mockResolvedValue(undefined)
 useToastStore.setState({ toasts: [] })
 mockTopics()
}

describe('GaleriChildPage: per-topic fetch, counter and grid (Perbaikan-2)', () => {
 beforeEach(resetMocks)

 it('loads the DEFAULT topic bucket (no session-wide fetch), then refetches the clicked chip — counter 8/10 → 0/10', async () => {
  mockPhotoBuckets({
   ss1: makePhotos('a', 8, 'ss1'),
   ss2: [],
  })

  const { container } = await renderChildPage()

  // Per-topic fetch keyed on the ACTIVE chip's session stage id…
  expect(photoService.getByParticipant).toHaveBeenCalledWith('c-1', {
   sessionStageId: 'ss1',
  })
  // …and never the old session-wide request (options argument omitted).
  expect(photoService.getByParticipant).not.toHaveBeenCalledWith('c-1')
  expect(screen.getByText('8/10 foto')).toBeInTheDocument()
  expect(container.querySelectorAll('img')).toHaveLength(8)

  // Switch chip → grid/counter reset to the new topic's bucket.
  await click(screen.getByRole('button', { name: 'Topik Dua' }))

  expect(photoService.getByParticipant).toHaveBeenCalledWith('c-1', {
   sessionStageId: 'ss2',
  })
  expect(screen.getByText('0/10 foto')).toBeInTheDocument()
  expect(container.querySelectorAll('img')).toHaveLength(0)
 })

 it('saves the mini-rapor pick with the PROGRAM stage of the active chip', async () => {
  mockPhotoBuckets({
   ss1: makePhotos('a', 1, 'ss1'),
   ss2: makePhotos('b', 1, 'ss2'),
  })

  const { container } = await renderChildPage()
  await click(screen.getByRole('button', { name: 'Topik Dua' }))

  await click(screen.getByRole('button', { name: START_LABEL }))
  const tile = Array.from(container.querySelectorAll('[role="button"]')).find((el) =>
   el.querySelector('img[src*="b-1"]'),
  ) as HTMLElement
  await click(tile)
  await click(screen.getByRole('button', { name: SAVE_LABEL }))

  // Picks stay keyed on program_stage_id (ps2), NOT the session stage id.
  expect(photoService.setReportPick).toHaveBeenCalledWith({
   participant_id: 'c-1',
   session_id: 's-1',
   program_stage_id: 'ps2',
   photo_id: 'b-1',
  })
 })

 it('header Tambah Foto forwards the active topic to the camera route', async () => {
  mockPhotoBuckets({ ss1: makePhotos('a', 1, 'ss1'), ss2: [] })

  await renderChildPage()
  await click(screen.getByRole('button', { name: 'Tambah Foto' }))

  expect(screen.getByText(CAMERA_HEADING)).toBeInTheDocument()
  expect(screen.getByTestId('camera-search').textContent).toBe('?stage=ss1')
 })
})

describe('GaleriChildPage: add-card tile (Perbaikan-2)', () => {
 beforeEach(resetMocks)

 it('is present at 9 photos and disappears once the topic hits exactly 10', async () => {
  mockPhotoBuckets({
   ss1: makePhotos('a', 9, 'ss1'),
   ss2: makePhotos('b', 10, 'ss2'),
  })

  await renderChildPage()

  expect(screen.getByText('9/10 foto')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: ADD_CARD_LABEL })).toBeInTheDocument()

  // Topic B is AT the cap → the add tile is gone (no 11th-photo affordance).
  await click(screen.getByRole('button', { name: 'Topik Dua' }))

  expect(screen.getByText('10/10 foto')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: ADD_CARD_LABEL })).toBeNull()
 })

 it('uses the exact photo-tile size classes and navigates to the camera with ?stage=', async () => {
  mockPhotoBuckets({ ss1: makePhotos('a', 2, 'ss1'), ss2: [] })

  const { container } = await renderChildPage()

  const addCard = screen.getByRole('button', { name: ADD_CARD_LABEL })
  const photoTile = container.querySelector('[role="button"]') as HTMLElement
  expect(photoTile).not.toBeNull()

  // Same tile geometry as a photo tile — the grid never reflows.
  for (const cls of ['aspect-[3/4]', 'rounded-2xl']) {
   expect(addCard.classList.contains(cls), `add-card missing ${cls}`).toBe(true)
   expect(photoTile.classList.contains(cls), `photo tile missing ${cls}`).toBe(true)
  }

  // Same navigation as the header button — active topic forwarded as ?stage=.
  await click(addCard)
  expect(screen.getByText(CAMERA_HEADING)).toBeInTheDocument()
  expect(screen.getByTestId('camera-search').textContent).toBe('?stage=ss1')
 })
})

describe('GaleriChildPage: legacy "Foto Lama" bucket (Perbaikan-2)', () => {
 beforeEach(resetMocks)

 it('shows the chip only for a non-empty legacy bucket, fetches it with session_stage_id=, no add-card, pick blocked with reason', async () => {
  const legacyRows = makePhotos('old', 2, '')
  mockPhotoBuckets({ ss1: makePhotos('a', 3, 'ss1') }, legacyRows)

  await renderChildPage()

  // Probe with PRESENT-but-EMPTY session_stage_id = the legacy-bucket signal.
  expect(photoService.getByParticipant).toHaveBeenCalledWith('c-1', {
   sessionStageId: '',
  })
  expect(screen.getByRole('button', { name: LEGACY_CHIP })).toBeInTheDocument()

  await click(screen.getByRole('button', { name: LEGACY_CHIP }))

  expect(photoService.getByParticipant).toHaveBeenCalledWith('c-1', {
   sessionStageId: '',
  })
  expect(screen.getByText('2/10 foto')).toBeInTheDocument()
  // Legacy rows are shown… without any add affordance (no program stage)…
  expect(screen.queryByRole('button', { name: ADD_CARD_LABEL })).toBeNull()
  // …and mini-raport select mode stays locked behind a visible reason.
  expect(screen.getByRole('button', { name: START_LABEL })).toBeDisabled()
  expect(screen.getByText(LEGACY_PICK_REASON)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: SAVE_LABEL })).toBeNull()
 })

 it('never shows the chip when the legacy bucket is empty', async () => {
  mockPhotoBuckets({ ss1: makePhotos('a', 3, 'ss1') }, [])

  await renderChildPage()

  expect(screen.queryByRole('button', { name: LEGACY_CHIP })).toBeNull()
  expect(screen.getByRole('button', { name: START_LABEL })).toBeInTheDocument()
 })
})
