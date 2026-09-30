import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import type * as ReactRouterDom from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'

// ── Mocks (registered before importing the page) ──────────────────────────
const navigateMock = vi.fn()

// Partial mock: everything else (MemoryRouter, Routes, ...) stays real so the
// page still renders inside the test's MemoryRouter.
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouterDom>()),
  useNavigate: () => navigateMock,
}))

vi.mock('@/core/services/sessions', () => ({
  sessionService: {
    getAll: vi.fn(),
    getById: vi.fn(),
  },
}))

vi.mock('@/core/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

// Import after mocks are registered
import DashboardPage from '@/features/fasilitator/pages/DashboardPage'
import { useAuth } from '@/core/hooks/useAuth'
import { sessionService } from '@/core/services/sessions'
import { SessionStatus } from '@/core/types/enums'

const user = { id: 'u1', name: 'Test', role: 'FASILITATOR' }

function envelope(data: unknown[]) {
  return { data, total: data.length, page: 1, limit: Math.max(data.length, 1), totalPages: 1 } as never
}

const baseSession = {
  id: 's-active',
  tenant_id: 't1',
  program_id: 'p1',
  name: 'Sesi Uji Aktif',
  session_date: '2026-09-30',
  start_time: '08:00',
  end_time: '09:00',
  location: 'Ruang 1',
  status: SessionStatus.ACTIVE,
  created_by: 'u1',
  created_at: '2026-09-30T01:00:00Z',
  is_my_session: true,
}

async function renderWith(sessions: unknown[]) {
  vi.mocked(sessionService.getAll).mockResolvedValue(envelope(sessions))
  const result = render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
  // Flush the init() fetch chain
  await act(async () => { })
  return result
}

const cardButton = (name: RegExp) => screen.getByRole('button', { name })

describe('fasilitator dashboard: edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user, isLoading: false } as never)
  })

  it('shows an explicit message (never an infinite skeleton) when auth settled with no user', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false } as never)

    const { container } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    await act(async () => { })

    // No fetch without a user, no skeleton left behind
    expect(sessionService.getAll).not.toHaveBeenCalled()
    expect(container.querySelector('.animate-pulse')).toBeNull()
    expect(screen.getByText('Belum masuk akun')).toBeInTheDocument()
    expect(screen.getByText('Sesi login tidak ditemukan. Silakan login ulang lalu coba lagi.')).toBeInTheDocument()

    // Retry re-runs the session check without resurrecting the skeleton
    const retry = screen.getByRole('button', { name: 'Coba Lagi' })
    act(() => {
      fireEvent.click(retry)
    })
    expect(screen.getByText('Belum masuk akun')).toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).toBeNull()
    expect(sessionService.getAll).not.toHaveBeenCalled()
  })

  it('keeps the skeleton only while auth is loading, then loads once the user appears', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: true } as never)
    vi.mocked(sessionService.getAll).mockResolvedValue(envelope([baseSession]))

    const { container, rerender } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    // Auth still settling → bounded skeleton, no fetch yet
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
    expect(sessionService.getAll).not.toHaveBeenCalled()

    // Auth settles with a user → data loads, skeleton gone
    vi.mocked(useAuth).mockReturnValue({ user, isLoading: false } as never)
    rerender(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    await act(async () => { })

    expect(sessionService.getAll).toHaveBeenCalled()
    expect(container.querySelector('.animate-pulse')).toBeNull()
    expect(screen.getByText('Sesi Uji Aktif')).toBeInTheDocument()
  })

  it('shows the full-page error state with a working retry when getAll rejects', async () => {
    vi.mocked(sessionService.getAll).mockRejectedValue(new Error('boom'))

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    await act(async () => { })

    expect(screen.getByText('Terjadi Kesalahan')).toBeInTheDocument()
    expect(screen.getByText('Terjadi kesalahan. Silakan coba lagi.')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Coba Lagi' })
    expect(sessionService.getAll).toHaveBeenCalledTimes(1)

    // Retry re-fetches and, on repeated failure, stays on the error UI
    await act(async () => {
      fireEvent.click(retry)
    })
    expect(sessionService.getAll).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Terjadi kesalahan. Silakan coba lagi.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the empty state when the facilitator has no sessions at all', async () => {
    await renderWith([])

    expect(screen.getByText('Belum ada sesi')).toBeInTheDocument()
    expect(screen.getByText('Anda belum ditugaskan di sesi manapun.')).toBeInTheDocument()
  })

  it('navigates to the groups page with sessionId for an ACTIVE owned session', async () => {
    await renderWith([baseSession])

    act(() => {
      fireEvent.click(cardButton(/Sesi Uji Aktif/))
    })

    expect(navigateMock).toHaveBeenCalledWith('/fasilitator/groups?sessionId=s-active')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the completed-session modal instead of navigating for a COMPLETED owned session', async () => {
    await renderWith([{ ...baseSession, id: 's-done', name: 'Sesi Uji Selesai', status: SessionStatus.COMPLETED }])

    act(() => {
      fireEvent.click(cardButton(/Sesi Uji Selesai/))
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Sesi sudah selesai')).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('opens an info modal without navigating for a DRAFT owned session', async () => {
    await renderWith([{ ...baseSession, id: 's-draft', name: 'Sesi Uji Draft', status: SessionStatus.DRAFT }])

    act(() => {
      fireEvent.click(cardButton(/Sesi Uji Draft/))
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Sesi masih draft')).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('navigates to the groups page for a CANCELLED owned session without opening a dialog', async () => {
    await renderWith([{ ...baseSession, id: 's-cancel', name: 'Sesi Uji Batal', status: SessionStatus.CANCELLED }])

    act(() => {
      fireEvent.click(cardButton(/Sesi Uji Batal/))
    })

    expect(navigateMock).toHaveBeenCalledWith('/fasilitator/groups?sessionId=s-cancel')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the raw status in an info modal for an unknown owned session status without navigating', async () => {
    const unknownStatus = 'ARCHIVED' as SessionStatus
    await renderWith([{ ...baseSession, id: 's-arch', name: 'Sesi Uji Arsip', status: unknownStatus }])

    act(() => {
      fireEvent.click(cardButton(/Sesi Uji Arsip/))
    })

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('Status sesi tidak dikenal')).toBeInTheDocument()
    // The interpolated description exposes the raw status value
    expect(dialog.textContent).toContain('ARCHIVED')
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('keeps a non-owner card disabled and communicates why it is not interactive', async () => {
    await renderWith([{ ...baseSession, id: 's-other', name: 'Sesi Bukan Milik', is_my_session: undefined }])

    const card = cardButton(/Sesi Bukan Milik/)
    expect(card).toBeDisabled()
    expect(card).toHaveAttribute('title', 'Sesi ini bukan tanggung jawab Anda')
    // The hint is also exposed to assistive tech inside the button
    expect(screen.getByText('Sesi ini bukan tanggung jawab Anda')).toBeInTheDocument()

    act(() => {
      fireEvent.click(card)
    })
    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders sessions with missing optional fields without crashing or leaking undefined', async () => {
    const sparseSession = {
      id: 's-sparse',
      tenant_id: 't1',
      program_id: 'p1',
      name: 'Sesi Tanpa Data',
      status: SessionStatus.ACTIVE,
      created_by: 'u1',
      created_at: '2026-09-30T01:00:00Z',
      is_my_session: true,
      // location, session_date, start_time, end_time, program_name all absent
    }

    const { container } = await renderWith([sparseSession])

    expect(screen.getByText('Sesi Tanpa Data')).toBeInTheDocument()
    // No times → "all day" fallback instead of " – " or a crash
    expect(screen.getByText('Sepanjang hari')).toBeInTheDocument()
    // No location → explicit fallback instead of a blank span
    expect(screen.getByText('Lokasi belum ditentukan')).toBeInTheDocument()

    const text = container.textContent ?? ''
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('null')
    expect(text).not.toContain('Invalid Date')
    expect(text).not.toContain('1970')
    // No date row is rendered at all when session_date is absent
    expect(container.querySelector('.text-xs.text-on-surface-variant\\/60')).toBeNull()
  })
})
