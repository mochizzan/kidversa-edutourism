import { getStoredUser } from '../services/backendClient'
import { UserRole } from '../types/enums'
import { STORAGE_KEYS } from '../constants/storage'

/**
 * Returns the active tenant ID for SUPER_ADMIN users.
 * Returns null for non-SA roles or when no tenant is selected.
 *
 * Used by:
 * - withTenantHeader (HTTP header X-Tenant-Id)
 * - openSSE (query param ?tenant_id=)
 * - missions.ts getActiveTenantId (write DTOs)
 */
export function getActiveTenantId(): string | null {
  const user = getStoredUser<{ role?: string }>()
  if (user?.role !== UserRole.SUPER_ADMIN) return null
  return typeof localStorage !== 'undefined'
    ? localStorage.getItem(STORAGE_KEYS.ACTIVE_TENANT_ID)
    : null
}
