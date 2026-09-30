import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { AvatarProps } from '@/shared/components/ui/Avatar'
import type * as AvatarModule from '@/shared/components/ui/Avatar'
import { render, screen } from './test-utils'

// ── Mocks (registered before importing the pages) ──────────────────────────
// Wrap the REAL shared Avatar with a marker div: each adoption site can then
// be asserted to render THE shared component (marker present with the right
// user props) while the delegating call still exercises the real
// getMediaUrl(...) resolution end-to-end inside the page.
vi.mock('@/shared/components/ui/Avatar', async (importOriginal) => {
  const actual = await importOriginal<typeof AvatarModule>()
  return {
    ...actual,
    Avatar: (props: AvatarProps) => (
      <div data-testid="shared-avatar" data-user-id={props.user.id}>
        <actual.Avatar {...props} />
      </div>
    ),
  }
})

// getMediaUrl's only dependency — keeps media URLs deterministic:
// /api/media/avatar/<id> with no tenant query.
vi.mock('@/core/utils/tenant', () => ({
  getActiveTenantId: () => null,
}))

vi.mock('@/core/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/shared/hooks/useGlobalSearch', () => ({
  useGlobalSearch: () => ({
    query: '',
    setQuery: vi.fn(),
    loading: false,
    results: [],
    searched: false,
    reset: vi.fn(),
  }),
}))

vi.mock('@/shared/hooks/useHeaderNotifications', () => ({
  useHeaderNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    acknowledge: vi.fn(),
  }),
}))

vi.mock('@/core/services/users', () => ({
  userService: { getAll: vi.fn() },
}))
vi.mock('@/core/services/programs', () => ({
  programService: { getAll: vi.fn() },
}))
vi.mock('@/core/services/sessions', () => ({
  sessionService: { getAll: vi.fn(), getParticipants: vi.fn() },
}))
vi.mock('@/core/services/participants', () => ({
  participantService: { getAll: vi.fn() },
}))
vi.mock('@/core/services/reports', () => ({
  reportService: { getBySession: vi.fn() },
}))
vi.mock('@/core/services/assessments', () => ({
  assessmentService: { getBySession: vi.fn() },
}))

// Import after mocks are registered
import { AppHeader } from '@/shared/components/layout/AppHeader'
import UsersPage from '@/features/admin/pages/UsersPage'
import AdminDashboardPage from '@/features/admin/pages/DashboardPage'
import { useAuth } from '@/core/hooks/useAuth'
import { userService } from '@/core/services/users'
import { programService } from '@/core/services/programs'
import { sessionService } from '@/core/services/sessions'
import { participantService } from '@/core/services/participants'
import { reportService } from '@/core/services/reports'
import { assessmentService } from '@/core/services/assessments'
import { ApprovalStatus, UserRole } from '@/core/types/enums'

function envelope<T>(data: T[]) {
  return { data, total: data.length, page: 1, limit: Math.max(data.length, 1), totalPages: 1 }
}

const adminUser = { id: 'u-admin', name: 'Admin Satu', role: UserRole.ADMIN }

const headerUser = {
  id: 'u-header',
  name: 'Kak Rina',
  role: UserRole.ADMIN,
  avatar_url: 'avatars/rina.jpg',
}

const tableUser = {
  id: 'u-table',
  tenant_id: 't-1',
  email: 'budi@example.com',
  password_hash: '',
  role: UserRole.KOORDINATOR,
  name: 'Budi Santoso',
  avatar_url: 'avatars/budi.jpg',
  is_active: true,
  approval_status: ApprovalStatus.APPROVED,
  created_at: '2026-01-01T00:00:00Z',
}

const teamUser = {
  id: 'u-team',
  tenant_id: 't-1',
  email: 'eni@example.com',
  password_hash: '',
  role: UserRole.FASILITATOR,
  name: 'Fasilitator Eni',
  avatar_url: 'avatars/eni.jpg',
  is_active: true,
  approval_status: ApprovalStatus.APPROVED,
  created_at: '2026-01-01T00:00:00Z',
}

const todayWib = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
const activeSession = {
  id: 's1',
  name: 'Sesi Hari Ini',
  program_id: 'p1',
  status: 'ACTIVE',
  session_date: todayWib,
  created_at: `${todayWib}T01:00:00Z`,
}
const program = { id: 'p1', name: 'Program A' }

// Asserts the site renders THE shared Avatar (marker) with the given user id
// AND that the real component resolved the stored relative path into the
// authenticated media URL — the exact bug GAP-5 described.
function expectSharedAvatar(container: HTMLElement, userId: string): HTMLElement {
  const marker = container.querySelector(
    `[data-testid="shared-avatar"][data-user-id="${userId}"]`,
  )
  expect(marker).not.toBeNull()
  const img = marker!.querySelector('img')
  expect(img?.getAttribute('src')).toBe(`/api/media/avatar/${userId}`)
  return marker as HTMLElement
}

describe('shared Avatar adoption sites', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false } as never)
    vi.mocked(userService.getAll).mockResolvedValue(envelope([]) as never)
    vi.mocked(programService.getAll).mockResolvedValue(envelope([program]) as never)
    vi.mocked(sessionService.getAll).mockResolvedValue(envelope([activeSession]) as never)
    vi.mocked(sessionService.getParticipants).mockResolvedValue([] as never)
    vi.mocked(participantService.getAll).mockResolvedValue(envelope([]) as never)
    vi.mocked(reportService.getBySession).mockResolvedValue({ items: [] } as never)
    vi.mocked(assessmentService.getBySession).mockResolvedValue([] as never)
  })

  it('AppHeader renders the shared Avatar for the signed-in user (raw avatar_url no longer leaks)', () => {
    vi.mocked(useAuth).mockReturnValue({ user: headerUser, isLoading: false } as never)

    const { container } = render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )

    const marker = expectSharedAvatar(container, 'u-header')
    expect(marker.querySelector('img')!.getAttribute('alt')).toBe('Kak Rina')
  })

  it('UsersPage table rows render the shared Avatar with the resolved media URL', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: adminUser, isLoading: false } as never)
    vi.mocked(userService.getAll).mockResolvedValue(envelope([tableUser]) as never)

    const { container } = render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    )
    await act(async () => { })

    expect(screen.getByText('Budi Santoso')).toBeTruthy()
    expectSharedAvatar(container, 'u-table')
  })

  it('admin dashboard team list renders shared Avatars for team members', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: adminUser, isLoading: false } as never)
    vi.mocked(userService.getAll).mockResolvedValue(envelope([teamUser]) as never)

    const { container } = render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>,
    )
    await act(async () => { })

    // TeamList renders nothing when it has no members — guards against a
    // vacuous pass where the avatar never had a chance to render.
    expect(screen.getByText('Tim Eduwisata')).toBeTruthy()
    expectSharedAvatar(container, 'u-team')
  })

})
