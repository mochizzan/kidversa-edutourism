import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { render, screen } from './test-utils'

vi.mock('@/core/services/programs', () => ({
  programService: { getAll: vi.fn(), getStages: vi.fn() },
}))
vi.mock('@/core/services/program-substages', () => ({
  programSubstageService: { listByStage: vi.fn() },
}))
vi.mock('@/core/utils/tenant', () => ({
  getActiveTenantId: () => null,
}))

// Import after mocks are registered
import TopicDetailPage from '@/features/admin/pages/TopicDetailPage'
import { programService } from '@/core/services/programs'
import { programSubstageService } from '@/core/services/program-substages'
import { useToastStore } from '@/core/stores/toastStore'
import type { ProgramStage, ProgramSubstage } from '@/core/types'

const topicId = 'topic-1'

const program = { id: 'prog-1', name: 'Program Satu' }

const stage: ProgramStage = {
  id: topicId,
  program_id: 'prog-1',
  sequence_order: 1,
  name: 'Topik Sejarah',
  description: 'Deskripsi topik',
  content_type: 'MIXED',
  is_photo_stage: false,
  created_at: '2026-01-01T00:00:00Z',
} as ProgramStage

const nineSubstages: ProgramSubstage[] = Array.from({ length: 9 }, (_, i) => ({
  id: `sub-${i + 1}`,
  program_stage_id: topicId,
  sequence_order: i + 1,
  name: `Kegiatan ${i + 1}`,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}))

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/admin/topics/${topicId}`]}>
      <Routes>
        <Route path="/admin/topics/:topicId" element={<TopicDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('TopicDetailPage kegiatan tab count', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToastStore.setState({ toasts: [] })
  })

  it('shows the kegiatan count on first render without clicking the tab', async () => {
    vi.mocked(programService.getAll).mockResolvedValue({ data: [program] } as never)
    vi.mocked(programService.getStages).mockResolvedValue([stage] as never)
    vi.mocked(programSubstageService.listByStage).mockResolvedValue(nineSubstages)

    renderPage()
    await act(async () => { })

    expect(screen.getByText(/Kegiatan \(9\)/)).toBeInTheDocument()
    expect(programSubstageService.listByStage).toHaveBeenCalledWith(topicId)
    // Default tab stays 'detail' — the count was never gated behind a click
    expect(screen.getByText('Deskripsi topik')).toBeInTheDocument()
  })

  it('still renders the detail tab with a zero count and an error toast when the kegiatan fetch fails', async () => {
    vi.mocked(programService.getAll).mockResolvedValue({ data: [program] } as never)
    vi.mocked(programService.getStages).mockResolvedValue([stage] as never)
    vi.mocked(programSubstageService.listByStage).mockRejectedValue(new Error('boom'))

    renderPage()
    await act(async () => { })

    expect(screen.getByText(/Kegiatan \(0\)/)).toBeInTheDocument()
    // Detail tab rendered (topic loaded) and the loading gate ended
    expect(screen.getByText('Deskripsi topik')).toBeInTheDocument()
    expect(screen.queryByText('Loading...')).toBeNull()
    const errorToasts = useToastStore.getState().toasts.filter((t) => t.type === 'error')
    expect(errorToasts.length).toBeGreaterThan(0)
    expect(errorToasts[0].message).toBe('Terjadi kesalahan. Silakan coba lagi.')
  })
})
