import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'

// ── Mocks (registered before importing the page) ──────────────────────────
vi.mock('@/core/services/sessions', () => ({
  sessionService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getGroups: vi.fn(),
  },
}))

vi.mock('@/core/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

// Import after mocks are registered
import GaleriSessionsPage from '@/features/fasilitator/pages/galeri/GaleriSessionsPage'
import { sessionService } from '@/core/services/sessions'
import { useAuth } from '@/core/hooks/useAuth'
import { SessionStatus } from '@/core/types/enums'

function envelope(data: unknown[]) {
  return { data, total: data.length, page: 1, limit: Math.max(data.length, 1), totalPages: 1 } as never
}

const ownedSession = {
  id: 's-1',
  tenant_id: 't1',
  program_id: 'p1',
  name: 'Sesi Dimiliki',
  session_date: '2026-09-30',
  location: 'Ruang 1',
  status: SessionStatus.ACTIVE,
  created_by: 'u1',
  created_at: '2026-09-30T01:00:00Z',
}

const otherSession = { ...ownedSession, id: 's-2', name: 'Sesi Lain', location: 'Ruang 2' }

async function renderPage() {
  const result = render(
    <MemoryRouter initialEntries={['/fasilitator/galeri']}>
      <Routes>
        <Route path="/fasilitator/galeri" element={<GaleriSessionsPage />} />
        <Route path="/fasilitator/galeri/sesi/:sessionId" element={<div>HALAMAN SESI</div>} />
      </Routes>
    </MemoryRouter>,
  )
  // Flush the fetchData() chain (getAll → facilitator-filtered getAll)
  await act(async () => { })
  return result
}

describe('GaleriSessionsPage: ownership gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    vi.mocked(sessionService.getAll).mockImplementation(async (params) => {
      if (params?.filters?.facilitator_id) return envelope([ownedSession])
      return envelope([ownedSession, otherSession])
    })
  })

  it('enters the owned session and keeps the non-owned one visible but locked', async () => {
    await renderPage()

    // Owner marker on the owned card
    expect(screen.getByText('Kelompok Anda')).toBeInTheDocument()
    // Both sessions list
    expect(screen.getByText('Sesi Dimiliki')).toBeInTheDocument()
    expect(screen.getByText('Sesi Lain')).toBeInTheDocument()

    // Locked card: visible, aria-disabled, with lock explanation
    const lockedCard = screen.getByRole('button', { name: /Sesi Lain/ })
    expect(lockedCard).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Sesi ini bukan tanggung jawab Anda — hanya dapat dilihat.')).toBeInTheDocument()

    // Locked card is NOT enterable
    fireEvent.click(lockedCard)
    expect(screen.queryByText('HALAMAN SESI')).toBeNull()

    // Owned card navigates to the session route
    fireEvent.click(screen.getByRole('button', { name: /Sesi Dimiliki/ }))
    expect(screen.getByText('HALAMAN SESI')).toBeInTheDocument()
  })

  it('queries the facilitator-filtered list to derive owned sessions', async () => {
    await renderPage()

    expect(sessionService.getAll).toHaveBeenNthCalledWith(1, {
      limit: 100,
      filters: { status: SessionStatus.ACTIVE },
    })
    expect(sessionService.getAll).toHaveBeenNthCalledWith(2, {
      limit: 100,
      filters: { status: SessionStatus.ACTIVE, facilitator_id: 'u1' },
    })
  })

  it('bypasses the ownership gate for non-FASILITATOR roles (single list call, all enterable)', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'a1', name: 'Admin', role: 'ADMIN' } } as never)

    await renderPage()

    // No facilitator-filtered second call
    expect(sessionService.getAll).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Kelompok Anda')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Sesi Lain/ }))
    expect(screen.getByText('HALAMAN SESI')).toBeInTheDocument()
  })
})

describe('GaleriSessionsPage: empty and error states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
  })

  it('shows the empty state when no active sessions exist', async () => {
    vi.mocked(sessionService.getAll).mockResolvedValue(envelope([]))

    await renderPage()

    expect(screen.getByText('Belum ada sesi aktif')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sesi/ })).toBeNull()
  })

  it('shows an error state with retry that recovers after a failed fetch', async () => {
    vi.mocked(sessionService.getAll).mockRejectedValueOnce(new TypeError('fetch failed'))

    await renderPage()

    expect(screen.getByText('Gagal terhubung ke server. Periksa koneksi internet Anda.')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Coba Lagi' })

    vi.mocked(sessionService.getAll).mockImplementation(async (params) => {
      if (params?.filters?.facilitator_id) return envelope([ownedSession])
      return envelope([ownedSession])
    })
    await act(async () => {
      fireEvent.click(retry)
    })

    expect(screen.getByText('Sesi Dimiliki')).toBeInTheDocument()
    expect(screen.queryByText('Gagal terhubung ke server. Periksa koneksi internet Anda.')).toBeNull()
  })
})

describe('GaleriSessionsPage: refetch on window focus/visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', name: 'Fasil', role: 'FASILITATOR' } } as never)
    vi.mocked(sessionService.getAll).mockImplementation(async (params) => {
      if (params?.filters?.facilitator_id) return envelope([ownedSession])
      return envelope([ownedSession, otherSession])
    })
  })

  it('silently refetches on window focus: a session that left the active list disappears without a skeleton flash', async () => {
    const { container } = await renderPage()
    expect(sessionService.getAll).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Sesi Dimiliki')).toBeInTheDocument()

    // Session completed/deleted on the backend → no longer in the ACTIVE list
    vi.mocked(sessionService.getAll).mockResolvedValue(envelope([]))

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(sessionService.getAll).toHaveBeenCalledTimes(4)
    expect(screen.getByText('Belum ada sesi aktif')).toBeInTheDocument()
    // Silent refetch: the loading skeleton must not flash on focus
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })

  it('refetches on visibilitychange and converges to the latest server state in place', async () => {
    await renderPage()
    expect(sessionService.getAll).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Sesi Dimiliki')).toBeInTheDocument()

    vi.mocked(sessionService.getAll).mockImplementation(async (params) => {
      if (params?.filters?.facilitator_id) return envelope([{ ...ownedSession, name: 'Sesi Diperbarui' }])
      return envelope([{ ...ownedSession, name: 'Sesi Diperbarui' }])
    })

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(sessionService.getAll).toHaveBeenCalledTimes(4)
    expect(screen.getByText('Sesi Diperbarui')).toBeInTheDocument()
    expect(screen.queryByText('Sesi Dimiliki')).toBeNull()
  })
})
