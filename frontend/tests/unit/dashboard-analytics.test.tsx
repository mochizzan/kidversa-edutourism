import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ── Mocks ──────────────────────────────────────────────────────────────────
// programService honors the limit: it only returns the first program unless
// the caller asks for the full page (>= FETCH_ALL_LIMIT), mirroring the real
// api-envelope listRequest behavior the bug came from.
const ALL_PROGRAMS = [
  { id: 'p1', name: 'Program A' },
  { id: 'p2', name: 'Program B' },
]

vi.mock('@/core/services/programs', () => ({
  programService: {
    getAll: vi.fn(async (params?: { limit?: number }) => {
      const data = (params?.limit ?? 0) >= 100 ? ALL_PROGRAMS : ALL_PROGRAMS.slice(0, 1)
      return { data, total: ALL_PROGRAMS.length, page: 1, limit: data.length, totalPages: 1 }
    }),
  },
}))

const todayWib = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

vi.mock('@/core/services/sessions', () => ({
  sessionService: {
    getAll: vi.fn(async () => ({
      data: [
        { id: 's1', name: 'Sesi Hari Ini', program_id: 'p1', status: 'ACTIVE', session_date: todayWib, created_at: `${todayWib}T01:00:00Z` },
        { id: 's2', name: 'Sesi Lama', program_id: 'p2', status: 'COMPLETED', session_date: '2020-01-05', created_at: '2020-01-05T01:00:00Z' },
      ],
      total: 2, page: 1, limit: 2, totalPages: 1,
    })),
    getParticipants: vi.fn(async () => []),
  },
}))

vi.mock('@/core/services/participants', () => ({
  participantService: {
    getAll: vi.fn(async (params?: { limit?: number }) => ({
      data: params && params.limit === 1 ? [] : [
        { id: 'part1', session_id: 's1', consent_photo: true, created_at: new Date().toISOString() },
        { id: 'part2', session_id: undefined, consent_photo: false, created_at: new Date().toISOString() },
      ],
      total: 2, page: 1, limit: 2, totalPages: 1,
    })),
  },
}))

vi.mock('@/core/services/users', () => ({
  userService: { getAll: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 0, totalPages: 1 })) },
}))

vi.mock('@/core/services/reports', () => ({
  reportService: { getBySession: vi.fn(async () => []) },
}))

vi.mock('@/core/services/assessments', () => ({
  assessmentService: {
    getBySession: vi.fn(async (sessionId: string) =>
      sessionId === 's1'
        ? [
          { star_rating: 5, session_id: 's1', assessed_at: new Date().toISOString() },
          { star_rating: 4, session_id: 's1', assessed_at: new Date().toISOString() },
        ]
        : [],
    ),
  },
}))

vi.mock('@/core/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Admin', role: 'ADMIN' } }),
}))

import DashboardPage from '@/features/admin/pages/DashboardPage'

async function renderAnalyticsTab() {
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByText('Analitik'))
}

describe('admin dashboard analytics tab (smoke)', () => {
  it('renders the trend chart, correct KPIs, and no report pipeline', async () => {
    await renderAnalyticsTab()

    // Trend chart renders instead of the old 7-day bar chart
    expect(screen.getByText('Tren Analitik Harian')).toBeTruthy()

    // Pipeline Laporan removed entirely
    expect(screen.queryByText('Pipeline Laporan')).toBeNull()

    // Program filter now lists every program (limit fix)
    const programSelect = screen.getByRole('combobox')
    const options = within(programSelect).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(
      expect.arrayContaining(['Semua Program', 'Program A', 'Program B']),
    )

    // KPI "Pendaftar": both participants count — the session-linked one via its
    // session, the unlinked one because no program/status filter is active.
    const pendaftarLabel = screen.getByText('Pendaftar')
    expect(within(pendaftarLabel.parentElement as HTMLElement).getByText('2')).toBeTruthy()

    // Average rating KPI: (5 + 4) / 2 = 4.5 from today's assessments only
    const ratingLabel = screen.getByText('Rata-rata Penilaian')
    expect(within(ratingLabel.parentElement as HTMLElement).getByText('4.5')).toBeTruthy()

    // Session in year 2020 is outside the default 30-day window
    expect(screen.queryByText('Sesi Lama')).toBeNull()
  })

  it('filters by program: selecting Program B hides Program A sessions', async () => {
    await renderAnalyticsTab()

    const programSelect = screen.getByRole('combobox')
    fireEvent.change(programSelect, { target: { value: 'p2' } })

    // Only session s2 (program p2, year 2020) remains → outside 30-day range →
    // active-in-range KPI becomes 0 and the unlinked participant drops out too.
    const pendaftarLabel = screen.getByText('Pendaftar')
    expect(within(pendaftarLabel.parentElement as HTMLElement).getByText('0')).toBeTruthy()
  })
})
