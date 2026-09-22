import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent, within } from '@testing-library/react'
import { render, screen } from './test-utils'
import { DEFAULT_CLIENT_PAGE_SIZE } from '@/core/constants/api'

vi.mock('@/core/services/frames', () => ({
  frameService: {
    getAll: vi.fn(),
    deactivate: vi.fn(),
    activate: vi.fn(),
    delete: vi.fn(),
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

const frameA: PhotoFrame = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: 'tenant-1',
  program_id: 'prog-1',
  name: 'Frame Alpha',
  file_url: '/api/media/frame/11111111',
  is_active: true,
  sort_order: 0,
  created_at: '2026-01-15T10:00:00Z',
}

const frameB: PhotoFrame = {
  id: '22222222-2222-4222-8222-222222222222',
  tenant_id: 'tenant-1',
  program_id: 'prog-2',
  name: 'Frame Beta',
  file_url: '/api/media/frame/22222222',
  is_active: false,
  sort_order: 0,
  created_at: '2026-02-20T10:00:00Z',
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <FramesPage />
    </MemoryRouter>,
  )

describe('FramesPage error surfacing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a warning when the program list fails to load', async () => {
    vi.mocked(frameService.getAll).mockResolvedValue({ data: [frame] } as never)
    vi.mocked(programService.getAll).mockRejectedValue(new Error('boom'))

    renderPage()
    await act(async () => { })

    expect(
      screen.getByText('Gagal memuat daftar program. Nama program mungkin tidak lengkap.'),
    ).toBeInTheDocument()
  })

  it('replaces the thumbnail with a fallback when the image fails to load', async () => {
    vi.mocked(frameService.getAll).mockResolvedValue({ data: [frame] } as never)
    vi.mocked(programService.getAll).mockResolvedValue({ data: [] } as never)

    renderPage()
    await act(async () => { })

    const img = screen.getByAltText('Bingkai Keren') as HTMLImageElement
    expect(img.src).not.toMatch(/^data:/)

    act(() => {
      fireEvent.error(img)
    })

    expect(img.src).toMatch(/^data:image\/svg\+xml/)
  })
})

describe('FramesPage table interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(frameService.getAll).mockResolvedValue({ data: [frameA, frameB] } as never)
    vi.mocked(programService.getAll).mockResolvedValue({
      data: [
        { id: 'prog-1', name: 'Program Satu' },
        { id: 'prog-2', name: 'Program Dua' },
      ],
    } as never)
  })

  // Action buttons are icon-only (Tooltip renders no title/aria), so they carry no
  // accessible name — address them by index within the row instead of by name.
  // Order: 0 = thumbnail preview, 1 = Edit, 2 = Toggle, 3 = Hapus.
  const row = (name: string) => screen.getByText(name).closest('tr') as HTMLTableRowElement
  const rowButtons = (name: string) => within(row(name)).getAllByRole('button')
  const rowNames = () =>
    within(screen.getByRole('table'))
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent ?? '')
  const filterGroup = () => within(screen.getByRole('group', { name: 'Filter status' }))

  it('deletes via the delete modal instead of deactivating', async () => {
    renderPage()
    await act(async () => { })

    act(() => {
      rowButtons('Frame Alpha')[3].click()
    })
    expect(screen.getByText('Hapus Frame')).toBeInTheDocument()

    act(() => {
      screen.getByRole('button', { name: 'Hapus' }).click()
    })
    await act(async () => { })

    expect(frameService.delete).toHaveBeenCalledWith(frameA.id)
    expect(frameService.deactivate).not.toHaveBeenCalled()
  })

  it('toggles active state in both directions', async () => {
    renderPage()
    await act(async () => { })

    act(() => {
      rowButtons('Frame Alpha')[2].click()
    })
    await act(async () => { })
    expect(frameService.deactivate).toHaveBeenCalledWith(frameA.id)

    act(() => {
      rowButtons('Frame Beta')[2].click()
    })
    await act(async () => { })
    expect(frameService.activate).toHaveBeenCalledWith(frameB.id)
  })

  it('filters rows by status pill', async () => {
    renderPage()
    await act(async () => { })

    act(() => {
      filterGroup().getByText('Nonaktif').click()
    })
    await act(async () => { })

    expect(screen.queryByText('Frame Alpha')).toBeNull()
    expect(screen.getByText('Frame Beta')).toBeInTheDocument()
  })

  it('filters rows by program', async () => {
    renderPage()
    await act(async () => { })

    const select = screen.getByLabelText('Program') as HTMLSelectElement
    act(() => {
      select.value = 'prog-1'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => { })

    expect(screen.getByText('Frame Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Frame Beta')).toBeNull()
  })

  it('filters rows by search text', async () => {
    renderPage()
    await act(async () => { })

    const input = screen.getByPlaceholderText('Cari...') as HTMLInputElement
    act(() => {
      // React 19's value tracker requires the native value setter to be called
      // before dispatching the input event, otherwise the onChange handler is not triggered
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, 'Alpha')
      }
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
    })
    // The list hook applies search synchronously (no debounce option), so a
    // single act() flush is enough for the filtered rows to render.
    await act(async () => { })

    expect(screen.getByText('Frame Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Frame Beta')).toBeNull()
  })

  it('sorts the whole dataset by creation date and by name', async () => {
    renderPage()
    await act(async () => { })

    // Default: created_at descending → newest (Beta) first
    expect(rowNames()[0]).toContain('Frame Beta')

    // New key → ascending
    act(() => {
      within(screen.getByRole('table')).getByRole('button', { name: 'Dibuat' }).click()
    })
    await act(async () => { })
    expect(rowNames()[0]).toContain('Frame Alpha')

    act(() => {
      within(screen.getByRole('table')).getByRole('button', { name: 'Nama' }).click()
    })
    await act(async () => { })
    expect(rowNames()[0]).toContain('Frame Alpha')
    expect(rowNames()[1]).toContain('Frame Beta')

    // Same key while asc → toggle to descending
    act(() => {
      within(screen.getByRole('table')).getByRole('button', { name: 'Nama' }).click()
    })
    await act(async () => { })
    expect(rowNames()[0]).toContain('Frame Beta')
  })

  it('opens the fullscreen preview and closes it with Escape or the close button', async () => {
    renderPage()
    await act(async () => { })

    act(() => {
      screen.getByRole('button', { name: 'Pratinjau Frame Alpha' }).click()
    })

    const dialog = screen.getByRole('dialog', { name: 'Pratinjau frame' })
    expect(within(dialog).getByAltText('Frame Alpha')).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(screen.queryByRole('dialog', { name: 'Pratinjau frame' })).toBeNull()

    act(() => {
      screen.getByRole('button', { name: 'Pratinjau Frame Alpha' }).click()
    })
    act(() => {
      screen.getByRole('button', { name: 'Tutup pratinjau' }).click()
    })
    expect(screen.queryByRole('dialog', { name: 'Pratinjau frame' })).toBeNull()
  })

  it('paginates client-side instead of rendering every row at once', async () => {
    const many: PhotoFrame[] = Array.from({ length: 30 }, (_, i) => ({
      id: `frame-${i + 1}`,
      tenant_id: 'tenant-1',
      program_id: 'prog-1',
      name: `Frame ${String(i + 1).padStart(2, '0')}`,
      file_url: `/api/media/frame/frame-${i + 1}`,
      is_active: true,
      sort_order: 0,
      created_at: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString(),
    }))
    vi.mocked(frameService.getAll).mockResolvedValue({ data: many } as never)

    renderPage()
    await act(async () => { })

    // CompactPagination only renders when there is more than one page
    const statusBar = screen.getByText(/Menampilkan 1-25 dari 30/)
    expect(statusBar).toBeInTheDocument()
    // header row + one page of rows (not all 30)
    expect(
      within(screen.getByRole('table')).getAllByRole('row'),
    ).toHaveLength(1 + DEFAULT_CLIENT_PAGE_SIZE)

    // created_at desc → newest first on page 1
    expect(rowNames()[0]).toContain('Frame 30')

    // Button drops unknown props, so its aria-label never reaches the DOM —
    // address the pager by position: [previous, next].
    const [previousPage, nextPage] = within(statusBar.parentElement as HTMLElement).getAllByRole('button')
    expect((previousPage as HTMLButtonElement).disabled).toBe(true)
    act(() => {
      nextPage.click()
    })
    await act(async () => { })

    expect(screen.getByText(/Menampilkan 26-30 dari 30/)).toBeInTheDocument()
    expect(rowNames()[0]).toContain('Frame 05')
    expect(screen.queryByText('Frame 30')).toBeNull()
  })
})
