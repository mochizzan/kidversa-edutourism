import { describe, it, expect, vi, beforeEach } from 'vitest'

// getMediaUrl must consult the active-tenant helper (same source the
// X-Tenant-Id header injection uses) to append ?tenant_id= for SUPER_ADMIN.
vi.mock('@/core/utils/tenant', () => ({
  getActiveTenantId: vi.fn(() => null),
}))

import { getMediaUrl } from '@/core/utils/media'
import { getActiveTenantId } from '@/core/utils/tenant'

describe('getMediaUrl', () => {
  beforeEach(() => {
    vi.mocked(getActiveTenantId).mockReturnValue(null)
  })

  it('appends ?tenant_id= when an active tenant is selected', () => {
    vi.mocked(getActiveTenantId).mockReturnValue('tenant-1')
    expect(getMediaUrl('frame', 'abc-123')).toBe(
      '/api/media/frame/abc-123?tenant_id=tenant-1',
    )
  })

  it('returns a bare path when no active tenant (non-SA roles scope via JWT)', () => {
    expect(getMediaUrl('frame', 'abc-123')).toBe('/api/media/frame/abc-123')
  })
})
