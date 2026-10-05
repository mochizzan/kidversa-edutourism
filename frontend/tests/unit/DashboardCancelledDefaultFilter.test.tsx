import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent, within } from '@testing-library/react'
import { render, screen } from './test-utils'
import { i18n } from '@/core/i18n'

// ── Mocks (registered before importing the page) ──────────────────────────
vi.mock('@/core/services/programs', () => ({
  programService: {
    getAll: vi.fn(async (params?: { limit?: number }) => {
      const data = (params?.limit ?? 0) >= 100 ? [
        { id: 'p1', name: 'Program A' },
        { id: 'p2', name: 'Program B' },
      ] : [{ id: 'p1', name: 'Program A' }]
      return { data, total: 2, page: 1, limit: data.length, totalPages: 1 }
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
        // Cancelled session WITH ratings today — must not skew DEFAULT KPIs.
        { id: 's3', name: 'Sesi Batal', program_id: 'p1', status: 'CANCELLED', session_date: todayWib, created_at: `${todayWib}T01:00:00Z` },
      ],
      total: 3, page: 1, limit: 3, totalPages: 1,
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
  reportService: { getBySession: vi.fn(async () => ({ items: [] })) },
}))

vi.mock('@/core/services/assessments', () => ({
  assessmentService: {
    getBySession: vi.fn(async (sessionId: string) =>
      sessionId === 's1'
        ? [
          { star_rating: 5, session_id: 's1', assessed_at: new Date().toISOString() },
          { star_rating: 4, session_id: 's1', assessed_at: new Date().toISOString() },
        ]
        : sessionId === 's3'
          ? [{ star_rating: 1, session_id: 's3', assessed_at: new Date().toISOString() }]
          : [],
    ),
  },
}))

vi.mock('@/core/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Admin', role: 'ADMIN' } }),
}))

import DashboardPage from '@/features/admin/pages/DashboardPage'

const flush = async () => {
  for (let i = 0; i < 6; i++) await act(async () => { })
}

async function renderAnalyticsTab() {
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
  await flush()
  act(() => {
    fireEvent.click(screen.getByText('Analitik'))
  })
  await flush()
}

/** Root card of the analytics filter bar (label span → icon group → card). */
function filterRoot() {
  const label = screen.getByText(i18n.t('admin.analytics.filterLabel'))
  return label.closest('div.bg-surface') as HTMLElement
}

function avgKpiValue() {
  const label = screen.getByText(i18n.t('admin.dashboard.kpi.avgLabel'))
  return within(label.parentElement as HTMLElement)
}

describe('DashboardPage — default status filter excludes CANCELLED (audit #17)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('default KPIs ignore cancelled-session ratings; the chip is off until chosen manually', async () => {
    await renderAnalyticsTab()

    // Default selection: DRAFT/ACTIVE/COMPLETED active, CANCELLED off.
    const root = filterRoot()
    expect(within(root).getByRole('button', { name: i18n.t('admin.status.draft') }).className).toContain('border-primary')
    expect(within(root).getByRole('button', { name: i18n.t('admin.status.active') }).className).toContain('border-primary')
    expect(within(root).getByRole('button', { name: i18n.t('admin.status.completed') }).className).toContain('border-primary')
    const cancelledChip = within(root).getByRole('button', { name: i18n.t('admin.status.cancelled') })
    expect(cancelledChip.className).not.toContain('border-primary')

    // s3 is CANCELLED with a 1-star rating: default average stays (5+4)/2.
    expect(avgKpiValue().getByText('4.5')).toBeInTheDocument()
    // Registrations unchanged: unlinked participant still counts by default.
    const pendaftarLabel = screen.getByText('Pendaftar')
    expect(within(pendaftarLabel.parentElement as HTMLElement).getByText('2')).toBeInTheDocument()

    // Manually enabling CANCELLED folds its ratings back in: (5+4+1)/3.
    act(() => {
      fireEvent.click(cancelledChip)
    })
    await flush()
    expect(avgKpiValue().getByText('3.3')).toBeInTheDocument()
    expect(filterRoot()).toBeTruthy()
  })
})
