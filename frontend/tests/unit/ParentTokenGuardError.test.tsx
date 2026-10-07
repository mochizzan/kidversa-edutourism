import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { act, render, screen } from './test-utils'
import { i18n } from '@/core/i18n'
import { ApiError } from '@/core/services/backend-client'

// Mock the service layer only — the guard's mapping and render run for real.
// ApiError stays the real class so `instanceof` sees production shapes.
vi.mock('@/core/services/reports', () => ({
  reportPublicService: { getByToken: vi.fn() },
}))

import { reportPublicService } from '@/core/services/reports'
import { ParentTokenGuard, mapParentTokenError } from '@/shared/components/auth/ParentTokenGuard'

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/parent/report?token=tok-abc123']}>
      <Routes>
        <Route
          path="/parent/report"
          element={
            <ParentTokenGuard kind="report">
              <div>BODY_OK</div>
            </ParentTokenGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

/** Flush the mount fetch chain (promise → setState inside the guard effect). */
async function flush() {
  await act(async () => { })
}

beforeEach(() => {
  vi.mocked(reportPublicService.getByToken).mockReset()
})

describe('mapParentTokenError — code-first mapping matrix', () => {
  it.each([
    // [label, error, expected]
    ['expired code wins over generic 403 (revoked/expiry share 403)', new ApiError('expired', 'token_expired', 403), 'EXPIRED'],
    ['revoked 403+token_invalid → INVALID (honest remap)', new ApiError('revoked', 'token_invalid', 403), 'INVALID'],
    ['bad token format 400 → INVALID', new ApiError('bad request', 'bad_request', 400), 'INVALID'],
    ['unknown token 404 → INVALID', new ApiError('not found', 'token_invalid', 404), 'INVALID'],
    ['gone 410 → INVALID', new ApiError('gone', 'token_invalid', 410), 'INVALID'],
    ['429 (status) → RATE_LIMITED', new ApiError('slow down', 'unknown', 429), 'RATE_LIMITED'],
    ['too_many_requests (code) → RATE_LIMITED', new ApiError('slow down', 'too_many_requests', 429), 'RATE_LIMITED'],
    ['500 → SERVER_ERROR', new ApiError('boom', 'internal_error', 500), 'SERVER_ERROR'],
    ['network status 0 → SERVER_ERROR', new ApiError('fetch failed', 'network', 0), 'SERVER_ERROR'],
    ['non-ApiError rejection → SERVER_ERROR (never blank)', new TypeError('fetch failed'), 'SERVER_ERROR'],
  ])('%s', (_label, err, expected) => {
    expect(mapParentTokenError(err)).toBe(expected)
  })

  it('ordering: token_expired beats a lying generic code on 403', () => {
    // A 403 carrying token_expired must not fall into the generic-403 INVALID
    // bucket — expiry is checked before any status-based rule.
    expect(mapParentTokenError(new ApiError('x', 'token_expired', 403))).toBe('EXPIRED')
    expect(mapParentTokenError(new ApiError('x', 'token_invalid', 403))).toBe('INVALID')
  })
})

describe('ParentTokenGuard screens', () => {
  it('403 token_expired → EXPIRED screen, not INVALID', async () => {
    vi.mocked(reportPublicService.getByToken).mockRejectedValue(
      new ApiError('token expired', 'token_expired', 403),
    )
    renderGuard()
    await flush()

    expect(screen.getByText(i18n.t('parent.token.expiredTitle'))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('parent.token.invalidTitle'))).toBeNull()
    expect(screen.queryByText('BODY_OK')).toBeNull()
  })

  it('revoked 403+token_invalid → INVALID screen (no lying expiry)', async () => {
    vi.mocked(reportPublicService.getByToken).mockRejectedValue(
      new ApiError('token revoked', 'token_invalid', 403),
    )
    renderGuard()
    await flush()

    expect(screen.getByText(i18n.t('parent.token.invalidTitle'))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('parent.token.expiredTitle'))).toBeNull()
  })

  it('429 → rate-limited screen with Indonesian copy', async () => {
    vi.mocked(reportPublicService.getByToken).mockRejectedValue(
      new ApiError('Too many requests', 'too_many_requests', 429),
    )
    renderGuard()
    await flush()

    expect(screen.getByText(i18n.t('parent.token.rateLimitedTitle'))).toBeInTheDocument()
    expect(screen.getByText(i18n.t('parent.token.rateLimitedDesc'))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('parent.token.invalidTitle'))).toBeNull()
    expect(screen.queryByText('BODY_OK')).toBeNull()
  })

  it('500 → server-error screen, not "link tidak valid"', async () => {
    vi.mocked(reportPublicService.getByToken).mockRejectedValue(
      new ApiError('Kesalahan server', 'internal_error', 500),
    )
    renderGuard()
    await flush()

    expect(screen.getByText(i18n.t('parent.token.serverErrorTitle'))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('parent.token.invalidTitle'))).toBeNull()
  })

  it('missing token → INVALID without any fetch', async () => {
    render(
      <MemoryRouter initialEntries={['/parent/report']}>
        <Routes>
          <Route
            path="/parent/report"
            element={
              <ParentTokenGuard kind="report">
                <div>BODY_OK</div>
              </ParentTokenGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    await flush()

    expect(screen.getByText(i18n.t('parent.token.invalidTitle'))).toBeInTheDocument()
    expect(reportPublicService.getByToken).not.toHaveBeenCalled()
  })
})
