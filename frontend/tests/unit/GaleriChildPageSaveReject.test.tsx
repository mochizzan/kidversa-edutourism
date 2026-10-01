import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { fireEvent, within } from '@testing-library/react'
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

vi.mock('@/core/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

// useSmartPhotos dimock penuh: kontrak aslinya MENANGKAP kegagalan jaringan
// setPick (→ resolve false); skenario setPick yang MELEMPAR hanya bisa
// disimulasikan di sini — membuktikan halaman tetap menampilkan pesan +
// tetap di mode pilih, tanpa rejection tak tertangani.
vi.mock('@/features/fasilitator/hooks/useSmartPhotos', () => ({
  useSmartPhotos: vi.fn(),
}))

// Import after mocks are registered
import GaleriChildPage from '@/features/fasilitator/pages/galeri/GaleriChildPage'
import { sessionService } from '@/core/services/sessions'
import { programService } from '@/core/services/programs'
import { useAuth } from '@/core/hooks/useAuth'
import { useSmartPhotos } from '@/features/fasilitator/hooks/useSmartPhotos'
import { useToastStore } from '@/core/stores/toastStore'

const session = {
  id: 's-1',
  tenant_id: 't1',
  program_id: 'p1',
  name: 'Sesi Galeri',
  session_date: '2026-09-30',
  location: 'Ruang 1',
  status: 'ACTIVE',
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

const START_LABEL = 'Pilih Foto Mini Rapor'
const SAVE_LABEL = 'Simpan Pilihan'
const PICK_ERROR_TOAST = 'Foto rapor gagal dipilih'

function getTile(container: HTMLElement, photoId: string) {
  const tile = Array.from(container.querySelectorAll('[role="button"]')).find((el) =>
    el.querySelector(`img[src*="${photoId}"]`),
  )
  if (!tile) throw new Error(`photo tile ${photoId} not found`)
  return tile as HTMLElement
}

async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el)
  })
}

async function renderChildPage() {
  const result = render(
    <MemoryRouter initialEntries={['/fasilitator/galeri/peserta/c-1']}>
      <Routes>
        <Route path="/fasilitator/galeri/peserta/:childId" element={<GaleriChildPage />} />
      </Routes>
    </MemoryRouter>,
  )
  await act(async () => { }) // flush participant → session/stages → topics → hook data
  return result
}

async function enterSelectMode() {
  await click(screen.getByRole('button', { name: START_LABEL }))
}

function toastMessages(type?: string) {
  return useToastStore
    .getState()
    .toasts.filter((t) => !type || t.type === type)
    .map((t) => t.message)
}

const setPick = vi.fn()

function mockHook() {
  vi.mocked(useSmartPhotos).mockReturnValue({
    photos: [photo],
    loadPhotos: vi.fn().mockResolvedValue(undefined),
    setPhotos: vi.fn(),
    picks: [],
    loadPicks: vi.fn().mockResolvedValue(undefined),
    setPick,
    clearPick: vi.fn(),
    deletePhoto: vi.fn().mockResolvedValue(undefined),
    uploadPhoto: vi.fn(),
  } as never)
}

describe('GaleriChildPage: setPick that REJECTS (contract escape hatch)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setPick.mockReset().mockResolvedValue(true)
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    vi.mocked(sessionService.getParticipantById).mockResolvedValue(participant as never)
    vi.mocked(sessionService.getById).mockResolvedValue(detail as never)
    vi.mocked(sessionService.getStages).mockResolvedValue([
      { id: 'ss1', session_id: 's-1', program_stage_id: 'ps1', status: 'IN_PROGRESS' },
    ] as never)
    vi.mocked(programService.getStages).mockResolvedValue([
      { id: 'ps1', program_id: 'p1', sequence_order: 1, name: 'Topik Satu', content_type: 'TEXT', is_photo_stage: false },
    ] as never)
    useToastStore.setState({ toasts: [] })
    mockHook()
  })

  it('logs the cause, toasts, and stays in select mode with the selection intact', async () => {
    const failure = new Error('network down')
    setPick.mockRejectedValue(failure)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

    try {
      const { container } = await renderChildPage()
      await enterSelectMode()
      await click(getTile(container, 'ph-1'))
      await click(screen.getByRole('button', { name: SAVE_LABEL }))

      // Sebab dicatat secara eksplisit (tanpa menelan)…
      expect(errorSpy).toHaveBeenCalledWith('[GaleriChildPage] saveSelection failed', failure)
      // …dan pengguna tetap melihat pesan kegagalan.
      expect(toastMessages('error')).toContain(PICK_ERROR_TOAST)
      // Mode pilih + pilihan tertunda tetap — bisa retry atau batal.
      expect(screen.getByRole('button', { name: SAVE_LABEL })).toBeInTheDocument()
      expect(within(getTile(container, 'ph-1')).getByText('Mini Rapor')).toBeInTheDocument()
      expect(setPick).toHaveBeenCalledTimes(1)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('a rejection after unmount still logs and toasts (global) without crashing', async () => {
    const failure = new Error('network down after navigation')
    setPick.mockRejectedValue(failure)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

    try {
      const { container, unmount } = await renderChildPage()
      await enterSelectMode()
      await click(getTile(container, 'ph-1'))
      await click(screen.getByRole('button', { name: SAVE_LABEL }))
      expect(setPick).toHaveBeenCalledTimes(1)

      unmount()
      await act(async () => { }) // rejection settles after unmount

      // Log tetap berisi sebab; toast global tetap terlihat meski halaman pergi.
      expect(errorSpy).toHaveBeenCalledWith('[GaleriChildPage] saveSelection failed', failure)
      expect(toastMessages('error')).toContain(PICK_ERROR_TOAST)
    } finally {
      errorSpy.mockRestore()
    }
  })
})
