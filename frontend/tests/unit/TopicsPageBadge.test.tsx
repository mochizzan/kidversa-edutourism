import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { within } from '@testing-library/react'
import { render, screen } from './test-utils'
import { i18n } from '@/core/i18n'

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
import TopicsPage from '@/features/admin/pages/TopicsPage'
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

// badge_image_url holds a Content id (badgeImage.ts contract) — the column
// must render it through getMediaUrl('content', id), never the raw id.
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

async function renderPage(stages: ProgramStage[]) {
  vi.mocked(programService.getAll).mockResolvedValue({ data: [program] } as never)
  vi.mocked(programService.getStages).mockResolvedValue(stages as never)
  vi.mocked(programSubstageService.listByStage).mockResolvedValue([])
  const result = render(
    <MemoryRouter>
      <TopicsPage />
    </MemoryRouter>,
  )
  // Flush the client-list fetch, the per-program stage fetch and the
  // CountCell listByStage promises so no cell still shows its loading '-'.
  await act(async () => { })
  await act(async () => { })
  return result
}

// Row scope: every row carries a non-empty description, so a '-' inside the
// row can only come from the BADGE column fallback.
const rowFor = (topicName: string) =>
  screen.getByText(topicName).closest('tr') as HTMLElement

describe('TopicsPage BADGE column (S3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('name + image: shows the badge name chip', async () => {
    await renderPage([
      stage('st-1', 'Topik A', { badge_name: 'Penjelajah', badge_image_url: 'cont-named' }),
    ])

    const row = rowFor('Topik A')
    expect(within(row).getByText('Penjelajah')).toBeInTheDocument()
    expect(within(row).queryByText('-')).toBeNull()
  })

  it('image only: column reflects the badge (thumbnail via media URL), not the "-" fallback', async () => {
    const { container } = await renderPage([
      stage('st-2', 'Topik B', { badge_image_url: 'cont-imgonly' }),
    ])

    const row = rowFor('Topik B')
    expect(
      within(row).queryByAltText(i18n.t('admin.programs.badgeAlt')),
    ).not.toBeNull()
    expect(
      within(row).queryByAltText(i18n.t('admin.programs.badgeAlt'))?.getAttribute('src'),
    ).toBe('/api/media/content/cont-imgonly')
    expect(container.querySelector('img[src="cont-imgonly"]')).toBeNull()
    expect(within(row).queryByText('-')).toBeNull()
  })

  it('no badge at all: the "-" fallback renders', async () => {
    await renderPage([stage('st-3', 'Topik C', {})])

    const row = rowFor('Topik C')
    expect(within(row).getByText('-')).toBeInTheDocument()
    expect(within(row).queryByAltText(i18n.t('admin.programs.badgeAlt'))).toBeNull()
  })
})
