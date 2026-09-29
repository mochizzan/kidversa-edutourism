import type { Tenant, TenantStats } from '../types'
import { apiRequest } from './backend-client'
import { arrayRequest, itemRequest } from './api-envelope'
import { API_ROUTES } from '../constants/apiRoutes'

export interface TenantService {
  getAll(): Promise<Tenant[]>
  getPublic(): Promise<Tenant[]>
  getStats(): Promise<TenantStats>
}

// getAll returns every tenant the caller is allowed to see. SUPER_ADMIN sees
// all tenants; ADMIN sees only their own tenant (enforced by the backend's
// TenantScope / usecase layer). The endpoint returns a paginated envelope; we
// unwrap the `data` array via the shared arrayRequest helper.
const getAll = async (): Promise<Tenant[]> => {
  return arrayRequest<Tenant>('GET', API_ROUTES.TENANTS.BASE)
}

// getPublic returns the anonymous tenant list (id/name/slug projection) used
// by the SUPER_ADMIN tenant selector at startup (tenantStore.fetchTenants).
// It deliberately calls API_ROUTES.PUBLIC.TENANTS — NOT TENANTS.BASE: this is
// the unauthenticated endpoint mounted by RegisterPublicRoutes. The call is
// byte-identical to the store's former inline apiRequest: same URL, GET
// method, headers/credentials (both go through apiRequest), and the raw
// `{ data }` unwrap with no arrayRequest tenant_id normalization.
const getPublic = async (): Promise<Tenant[]> => {
  const res = await apiRequest<{ data: Tenant[] }>('GET', API_ROUTES.PUBLIC.TENANTS)
  return res.data
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
  getPublic,
  getStats,
}
