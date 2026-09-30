import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { render } from './test-utils'

// getMediaUrl — the Avatar's only dependency — resolves through
// getActiveTenantId for the SUPER_ADMIN ?tenant_id= fallback. Mock that
// dependency (not media.ts itself) so the real URL-building code runs.
vi.mock('@/core/utils/tenant', () => ({
  getActiveTenantId: vi.fn(() => null),
}))

import { Avatar } from '@/shared/components/ui/Avatar'
import { getActiveTenantId } from '@/core/utils/tenant'

const alice = { id: 'u-1', name: 'Alice', avatar_url: 'avatars/u-1.jpg' }

describe('shared Avatar', () => {
  beforeEach(() => {
    vi.mocked(getActiveTenantId).mockReturnValue(null)
  })

  it('renders <img> with getMediaUrl("avatar", id) when avatar_url is set', () => {
    const { container } = render(<Avatar user={alice} />)

    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toBe('/api/media/avatar/u-1')
    expect(img!.getAttribute('alt')).toBe('Alice')
    // The stored relative path must never leak into src (the original bug).
    expect(img!.getAttribute('src')).not.toContain('avatars/u-1.jpg')
  })

  it('scopes the media URL to the active tenant (SUPER_ADMIN fallback)', () => {
    vi.mocked(getActiveTenantId).mockReturnValue('tenant-9')

    const { container } = render(<Avatar user={alice} />)

    expect(container.querySelector('img')!.getAttribute('src')).toBe(
      '/api/media/avatar/u-1?tenant_id=tenant-9',
    )
  })

  it('renders the uppercased initial fallback when avatar_url is unset', () => {
    const { container } = render(<Avatar user={{ id: 'u-2', name: 'budi santoso' }} />)

    expect(container.querySelector('img')).toBeNull()
    const fallback = container.querySelector('[role="img"]')
    expect(fallback?.textContent).toBe('B')
    expect(fallback?.getAttribute('aria-label')).toBe('budi santoso')
  })

  it('falls back to the initial when the image fails to load', () => {
    const { container } = render(<Avatar user={alice} />)

    fireEvent.error(container.querySelector('img')!)

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[role="img"]')?.textContent).toBe('A')
  })

  it('renders "?" when there is no name at all', () => {
    const { container } = render(<Avatar user={{ id: 'u-3' }} />)

    const fallback = container.querySelector('[role="img"]')
    expect(fallback?.textContent).toBe('?')
    expect(fallback?.getAttribute('aria-label')).toBe('?')
  })
})
