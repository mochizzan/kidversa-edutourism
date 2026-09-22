import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from './test-utils'

vi.mock('@/core/services/programs', () => ({
  programService: { getAll: vi.fn() },
}))

// Import after mock is registered
import FrameUploadPage from '@/features/admin/pages/FrameUploadPage'
import { programService } from '@/core/services/programs'

describe('FrameUploadPage error surfacing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a warning when the program list fails to load', async () => {
    vi.mocked(programService.getAll).mockRejectedValue(new Error('boom'))

    render(
      <MemoryRouter>
        <FrameUploadPage />
      </MemoryRouter>,
    )
    await act(async () => { })

    expect(
      screen.getByText('Gagal memuat daftar program. Pilihan program tidak tersedia.'),
    ).toBeInTheDocument()
  })
})
