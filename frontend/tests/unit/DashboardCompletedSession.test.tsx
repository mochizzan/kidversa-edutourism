import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'

// ── Mocks (registered before importing the page) ──────────────────────────
const navigateMock = vi.fn()

// Partial mock: everything else (MemoryRouter, Routes, ...) stays real so the
// page still renders inside the test's MemoryRouter.
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigateMock,
}))

vi.mock('@/core/services/sessions', () => ({
  sessionService: {
    getAll: vi.fn(),
  },
}))

vi.mock('@/core/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Test', role: 'FASILITATOR' } }),
}))

// Import after mocks are registered
import DashboardPage from '@/features/fasilitator/pages/DashboardPage'
import { sessionService } from '@/core/services/sessions'
import { SessionStatus } from '@/core/types/enums'
import type { Session } from '@/core/types'

const completedSession: Session = {
  id: 's-done',
  tenant_id: 't1',
  program_id: 'p1',
  name: 'Sesi Uji Selesai',
  session_date: '2026-09-30',
  start_time: '08:00',
  end_time: '09:00',
  location: 'Ruang 1',
  status: SessionStatus.COMPLETED,
  created_by: 'u1',
  created_at: '2026-09-30T01:00:00Z',
  is_my_session: true,
}

const activeSession: Session = {
  ...completedSession,
  id: 's-active',
  name: 'Sesi Uji Aktif',
  status: SessionStatus.ACTIVE,
}

const notMineSession: Session = {
  ...completedSession,
  id: 's-other',
  name: 'Sesi Bukan Milik',
  is_my_session: false,
}

async function renderWith(sessions: Session[]) {
  vi.mocked(sessionService.getAll).mockResolvedValue({
    data: sessions,
    total: sessions.length,
    page: 1,
    limit: sessions.length,
    totalPages: 1,
  } as never)
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
  // Flush the init() fetch (getAll → setSessions → setLoading(false))
  await act(async () => { })
}

const cardButton = (name: RegExp) => screen.getByRole('button', { name })

describe('fasilitator dashboard: completed session card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens "Sesi sudah selesai" modal instead of navigating for a COMPLETED owned session', async () => {
    await renderWith([completedSession])

    act(() => {
      fireEvent.click(cardButton(/Sesi Uji Selesai/))
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Sesi sudah selesai')).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('closes the modal via the close button without navigating', async () => {
    await renderWith([completedSession])

    act(() => {
      fireEvent.click(cardButton(/Sesi Uji Selesai/))
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Tutup' }))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('navigates to the groups page for an ACTIVE owned session', async () => {
    await renderWith([activeSession])

    act(() => {
      fireEvent.click(cardButton(/Sesi Uji Aktif/))
    })

    expect(navigateMock).toHaveBeenCalledWith('/fasilitator/groups?sessionId=s-active')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps a non-owner card disabled: no modal, no navigation', async () => {
    await renderWith([notMineSession])

    const card = cardButton(/Sesi Bukan Milik/)
    expect(card).toBeDisabled()

    act(() => {
      fireEvent.click(card)
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
