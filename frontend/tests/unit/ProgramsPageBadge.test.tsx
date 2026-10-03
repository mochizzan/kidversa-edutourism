import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'
import { i18n } from '@/core/i18n'

vi.mock('@/core/services/programs', () => ({
  programService: {
    getAll: vi.fn(),
    getStages: vi.fn(),
    deleteStage: vi.fn(),
    toggleActive: vi.fn(),
    delete: vi.fn(),
  },
}))
vi.mock('@/core/services/program-substages', () => ({
  programSubstageService: { listByStage: vi.fn() },
}))
vi.mock('@/core/utils/tenant', () => ({
  getActiveTenantId: () => null,
}))

// Import after mocks are registered
import ProgramsPage from '@/features/admin/pages/ProgramsPage'
import { programService } from '@/core/services/programs'
import { programSubstageService } from '@/core/services/program-substages'
import type { ProgramStage } from '@/core/types'

const program = {
  id: 'prog-1',
  name: 'Program Satu',
  description: 'Deskripsi program',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
}

// A program-stage fixture; badge fields are supplied per test. badge_image_url
// holds a Content id (badgeImage.ts contract) — display MUST go through
// getMediaUrl('content', id), never the raw id.
const stage = (id: string, name: string, badge: Partial<ProgramStage>): ProgramStage =>
  ({
    id,
    program_id: 'prog-1',
    sequence_order: 1,
    name,
    description: 'Deskripsi topik',
    content_type: 'MIXED',
    created_at: '2026-01-01T00:00:00Z',
    ...badge,
  }) as ProgramStage

const flush = () => act(async () => { })

async function renderExpanded(stages: ProgramStage[]) {
  vi.mocked(programService.getAll).mockResolvedValue({ data: [program] } as never)
  vi.mocked(programService.getStages).mockResolvedValue(stages as never)
  vi.mocked(programSubstageService.listByStage).mockResolvedValue([])
  const result = render(
    <MemoryRouter>
      <ProgramsPage />
    </MemoryRouter>,
  )
  await flush()
  // The badge line lives in the expandable topics panel (ExpandedTopicsPanel).
  fireEvent.click(screen.getByRole('button', { name: 'Expand row' }))
  await flush()
  return result
}

const noBadge = () => i18n.t('admin.programs.noBadge')

describe('ProgramsPage topic panel badge line (S1/S2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('name + image: thumbnail resolves through the media endpoint, line shows the name', async () => {
    const { container } = await renderExpanded([
      stage('st-1', 'Topik A', { badge_name: 'Penjelajah', badge_image_url: 'cont-named' }),
    ])

    // S1: the <img> src is the servable media URL, NOT the raw Content id.
    expect(container.querySelector('img[src="/api/media/content/cont-named"]')).not.toBeNull()
    expect(container.querySelector('img[src="cont-named"]')).toBeNull()
    expect(
      screen.getByText(i18n.t('admin.programs.badgeLine', { name: 'Penjelajah' }), { exact: false }),
    ).toBeInTheDocument()
    expect(screen.queryByText(noBadge(), { exact: false })).toBeNull()
  })

  it('image only: badge row still indicates a badge — never "Tanpa badge"', async () => {
    const { container } = await renderExpanded([
      stage('st-2', 'Topik B', { badge_image_url: 'cont-imgonly' }),
    ])

    expect(container.querySelector('img[src="/api/media/content/cont-imgonly"]')).not.toBeNull()
    expect(container.querySelector('img[src="cont-imgonly"]')).toBeNull()
    // Existing i18n label marks the badge without a name (no new locale keys).
    expect(screen.getByText(i18n.t('admin.topic.badgeTitle'), { exact: false })).toBeInTheDocument()
    expect(screen.queryByText(noBadge(), { exact: false })).toBeNull()
  })

  it('no badge at all: "Tanpa badge" fallback renders', async () => {
    await renderExpanded([stage('st-3', 'Topik C', {})])

    expect(screen.getByText(noBadge(), { exact: false })).toBeInTheDocument()
  })

  it('mixed rows: "Tanpa badge" appears exactly once — only for the badge-less stage', async () => {
    const { container } = await renderExpanded([
      stage('st-1', 'Topik A', { badge_name: 'Penjelajah', badge_image_url: 'cont-named' }),
      stage('st-2', 'Topik B', { badge_image_url: 'cont-imgonly' }),
      stage('st-3', 'Topik C', {}),
    ])

    expect(screen.getAllByText(noBadge(), { exact: false })).toHaveLength(1)
    expect(
      screen.getByText(i18n.t('admin.programs.badgeLine', { name: 'Penjelajah' }), { exact: false }),
    ).toBeInTheDocument()
    expect(screen.getByText(i18n.t('admin.topic.badgeTitle'), { exact: false })).toBeInTheDocument()
    expect(container.querySelector('img[src="/api/media/content/cont-named"]')).not.toBeNull()
    expect(container.querySelector('img[src="/api/media/content/cont-imgonly"]')).not.toBeNull()
  })
})
