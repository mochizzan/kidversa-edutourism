import { describe, it, expect, vi, beforeEach } from 'vitest'

// P1-3: getMediaUrl's optional ?v= cache key. Mock only the tenant helper —
// the real URL-building code in media.ts must run (same pattern as
// media.test.ts).
vi.mock('@/core/utils/tenant', () => ({
  getActiveTenantId: vi.fn(() => null),
}))

import { getMediaUrl } from '@/core/utils/media'
import { getActiveTenantId } from '@/core/utils/tenant'

describe('getMediaUrl version param (P1-3 cache key)', () => {
  beforeEach(() => {
    vi.mocked(getActiveTenantId).mockReturnValue(null)
  })

  it('leaves the URL unchanged when no version is given', () => {
    expect(getMediaUrl('avatar', 'u-1')).toBe('/api/media/avatar/u-1')
    expect(getMediaUrl('content', 'c-1', undefined)).toBe('/api/media/content/c-1')
    expect(getMediaUrl('content', 'c-1', null)).toBe('/api/media/content/c-1')
    // Empty string must not produce a dangling ?v=.
    expect(getMediaUrl('frame', 'f-1', '')).toBe('/api/media/frame/f-1')
  })

  it('appends ?v= when a version is provided, and the URL differs from the versionless one', () => {
    const versionless = getMediaUrl('avatar', 'u-1')
    const versioned = getMediaUrl('avatar', 'u-1', 'avatars/u-1.jpg')

    expect(versioned).not.toBe(versionless)
    expect(versioned).toBe('/api/media/avatar/u-1?v=avatars%2Fu-1.jpg')
    // The id (cache-key half 1) is untouched; only the version param differs.
    expect(versioned.startsWith('/api/media/avatar/u-1?')).toBe(true)
  })

  it('merges the version with tenant_id into ONE correctly ordered query string', () => {
    vi.mocked(getActiveTenantId).mockReturnValue('tenant-1')

    // Tenant scope and version share a single "?" — never a second "?".
    expect(getMediaUrl('content', 'c-1', 'contents/c.jpg')).toBe(
      '/api/media/content/c-1?tenant_id=tenant-1&v=contents%2Fc.jpg',
    )
    // Versionless tenant scoping keeps the historical shape.
    expect(getMediaUrl('content', 'c-1')).toBe('/api/media/content/c-1?tenant_id=tenant-1')
  })

  it('changes the URL whenever the version changes (invalidation)', () => {
    const before = getMediaUrl('avatar', 'u-1', 'avatars/old.jpg')
    const after = getMediaUrl('avatar', 'u-1', 'avatars/new.jpg')
    expect(before).not.toBe(after)
  })
})
