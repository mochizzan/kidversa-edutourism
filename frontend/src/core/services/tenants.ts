import type { Tenant, TenantStats } from '../types'
import { arrayRequest, itemRequest } from './api-envelope'
import { API_ROUTES } from '../constants/apiRoutes'

export interface TenantService {
  getAll(): Promise<Tenant[]>
  getStats(): Promise<TenantStats>
}

// getAll returns every tenant the caller is allowed to see. SUPER_ADMIN sees
// all tenants; ADMIN sees only their own tenant (enforced by the backend's
// TenantScope / usecase layer). The endpoint returns a paginated envelope; we
// unwrap the `data` array via the shared arrayRequest helper.
const getAll = async (): Promise<Tenant[]> => {
  return arrayRequest<Tenant>('GET', API_ROUTES.TENANTS.BASE)
}

// getStats returns per-tenant user counts computed server-side. This avoids a
// global /api/users fetch (which is tenant-scoped and would 400 without a
// selected tenant) and is accurate for SUPER_ADMIN across all tenants.
// Backend membungkus stats dalam envelope { data: { user_counts: [...] } };
// itemRequest mengembalikan res.data (TenantStats) secara konsisten.
const getStats = async (): Promise<TenantStats> => {
  return itemRequest<TenantStats>('GET', API_ROUTES.TENANTS.STATS)
}

export const tenantService: TenantService = {
  getAll,
  getStats,
}
