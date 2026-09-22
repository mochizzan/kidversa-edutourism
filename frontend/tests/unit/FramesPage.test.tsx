import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'

vi.mock('@/core/services/frames', () => ({
  frameService: {
    getAll: vi.fn(),
    deactivate: vi.fn(),
  },
}))
vi.mock('@/core/services/programs', () => ({
  programService: { getAll: vi.fn() },
}))
vi.mock('@/core/utils/tenant', () => ({
  getActiveTenantId: () => null,
}))

// Import after mocks are registered
import FramesPage from '@/features/admin/pages/FramesPage'
import { frameService } from '@/core/services/frames'
import { programService } from '@/core/services/programs'
import type { PhotoFrame } from '@/core/types'

const frame: PhotoFrame = {
  id: 'frame-1',
  tenant_id: 'tenant-1',
  name: 'Bingkai Keren',
  file_url: '/api/media/frame/frame-1',
  is_active: true,
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
}

describe('FramesPage error surfacing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a warning when the program list fails to load', async () => {
    vi.mocked(frameService.getAll).mockResolvedValue({ data: [frame] } as never)
    vi.mocked(programService.getAll).mockRejectedValue(new Error('boom'))

    render(
      <MemoryRouter>
        <FramesPage />
      </MemoryRouter>,
    )
    await act(async () => { })

    expect(
      screen.getByText('Gagal memuat daftar program. Nama program mungkin tidak lengkap.'),
    ).toBeInTheDocument()
  })

  it('replaces the thumbnail with a fallback when the image fails to load', async () => {
    vi.mocked(frameService.getAll).mockResolvedValue({ data: [frame] } as never)
    vi.mocked(programService.getAll).mockResolvedValue({ data: [] } as never)

    render(
      <MemoryRouter>
        <FramesPage />
      </MemoryRouter>,
    )
    await act(async () => { })

    const img = screen.getByAltText('Bingkai Keren') as HTMLImageElement
    expect(img.src).not.toMatch(/^data:/)

    act(() => {
      fireEvent.error(img)
    })

    expect(img.src).toMatch(/^data:image\/svg\+xml/)
  })
})
