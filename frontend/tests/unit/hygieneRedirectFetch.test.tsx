import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { act, render, screen } from './test-utils'
import { useAuthStore } from '@/core/stores/authStore'
import { ROUTES } from '@/core/constants/app'

// Transport-only mock: the real listRequest → api-envelope → apiRequest chain
// runs except the fetch itself.
vi.mock('@/core/services/backend-client', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, apiRequest: vi.fn() }
})

vi.mock('@/core/services/users', () => ({
  changePassword: vi.fn(),
}))

import { apiRequest } from '@/core/services/backend-client'
import {
  listRequest,
  fetchAllPages,
} from '@/core/services/api-envelope'
import ChangePasswordPage from '@/features/auth/pages/ChangePasswordPage'

const mockedRequest = vi.mocked(apiRequest)

async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => { })
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedRequest.mockReset()
})

describe('H-1: ChangePassword default redirect is role-aware (AR-12)', () => {
  function LocationProbe() {
    const location = useLocation()
    return <div data-testid="landed">{location.pathname}</div>
  }

  function renderCase(initialEntry: string) {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/auth/change-password" element={<ChangePasswordPage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it.each([
    ['SUPER_ADMIN', ROUTES.ADMIN.TENANTS],
    ['ADMIN', ROUTES.ADMIN.DASHBOARD],
    ['KOORDINATOR', ROUTES.ADMIN.DASHBOARD],
    ['FASILITATOR', ROUTES.FASILITATOR.DASHBOARD],
  ])('%s without must_change_password bounces to %s (not a fixed dashboard)', async (role, expected) => {
    useAuthStore.setState({
      user: { id: 'u-1', name: 'Uji', role, must_change_password: false } as never,
      isAuthenticated: true,
    })
    const { unmount } = renderCase('/auth/change-password')
    await flush()
    // The guard navigated away from the change-password form to the
    // role-appropriate landing page.
    expect(screen.getByTestId('landed').textContent ?? '').toBe(expected)
    unmount()
  })

  it('explicit ?returnUrl still wins over the role default', async () => {
    useAuthStore.setState({
      user: { id: 'u-1', name: 'Uji', role: 'ADMIN', must_change_password: false } as never,
      isAuthenticated: true,
    })
    renderCase('/auth/change-password?returnUrl=%2Fadmin%2Fsessions')
    await flush()
    expect(screen.getByTestId('landed').textContent ?? '').toBe('/admin/sessions')
  })
})

describe('H-3: ListFetchOpts fetchAll + signal (AR-12)', () => {
  it('legacy trigger preserved: limit>=100 fans out when fetchAll is undefined', async () => {
    const pageOf = (id: string) => ({ id })
    mockedRequest
      .mockResolvedValueOnce({
        data: Array.from({ length: 100 }, (_, i) => pageOf(`a-${i}`)),
        meta: { page: 1, limit: 100, total: 250 },
      } as never)
      .mockResolvedValueOnce({
        data: Array.from({ length: 100 }, (_, i) => pageOf(`b-${i}`)),
        meta: { page: 2, limit: 100, total: 250 },
      } as never)
      .mockResolvedValueOnce({
        data: Array.from({ length: 50 }, (_, i) => pageOf(`c-${i}`)),
        meta: { page: 3, limit: 100, total: 250 },
      } as never)

    const res = await listRequest<{ id: string }>('/api/things', { limit: 100 })
    expect(res.data).toHaveLength(250)
    expect(res.data[0]).toEqual({ id: 'a-0' })
    expect(res.data[249]).toEqual({ id: 'c-49' })
    expect(mockedRequest).toHaveBeenCalledTimes(3)
  })

  it('fetchAll:false returns the single requested page even for limit>=100', async () => {
    mockedRequest.mockResolvedValueOnce({
      data: Array.from({ length: 100 }, (_, i) => ({ id: `a-${i}` })),
      meta: { page: 1, limit: 100, total: 250 },
    } as never)

    const res = await listRequest<{ id: string }>('/api/things', { limit: 100 }, { fetchAll: false })
    expect(res.data).toHaveLength(100)
    expect(res.total).toBe(250)
    expect(mockedRequest).toHaveBeenCalledTimes(1)
  })

  it('fetchAll:true fans out for a small limit', async () => {
    mockedRequest
      .mockResolvedValueOnce({
        data: Array.from({ length: 10 }, (_, i) => ({ id: `a-${i}` })),
        meta: { page: 1, limit: 10, total: 25 },
      } as never)
      .mockResolvedValueOnce({
        data: Array.from({ length: 10 }, (_, i) => ({ id: `b-${i}` })),
        meta: { page: 2, limit: 10, total: 25 },
      } as never)
      .mockResolvedValueOnce({
        data: Array.from({ length: 5 }, (_, i) => ({ id: `c-${i}` })),
        meta: { page: 3, limit: 10, total: 25 },
      } as never)

    const res = await listRequest<{ id: string }>('/api/things', { limit: 10 }, { fetchAll: true })
    expect(res.data).toHaveLength(25)
    expect(mockedRequest).toHaveBeenCalledTimes(3)
  })

  it('aborted signal stops fetchAllPages between pages', async () => {
    const controller = new AbortController()
    const pages = [
      { data: Array.from({ length: 10 }, (_, i) => ({ id: `a-${i}` })), meta: { page: 1, limit: 10, total: 30 } },
      { data: Array.from({ length: 10 }, (_, i) => ({ id: `b-${i}` })), meta: { page: 2, limit: 10, total: 30 } },
      { data: Array.from({ length: 10 }, (_, i) => ({ id: `c-${i}` })), meta: { page: 3, limit: 10, total: 30 } },
    ]
    let calls = 0
    const all = await fetchAllPages<{ id: string }>(
      async (page: number) => {
        calls += 1
        if (page === 2) controller.abort()
        return pages[page - 1]
      },
      1,
      { signal: controller.signal },
    )
    // Page 2 was fetched (abort fired during its handler), page 3 never was.
    expect(calls).toBe(2)
    expect(all).toHaveLength(20)
  })

  it('signal is forwarded to apiRequest on single-shot fetches', async () => {
    const controller = new AbortController()
    mockedRequest.mockResolvedValueOnce({
      data: [{ id: 'a' }],
      meta: { page: 1, limit: 10, total: 1 },
    } as never)

    await listRequest('/api/things', { limit: 10 }, { signal: controller.signal })
    expect(mockedRequest).toHaveBeenCalledWith(
      'GET',
      expect.stringContaining('/api/things'),
      undefined,
      { signal: controller.signal },
    )
  })
})
