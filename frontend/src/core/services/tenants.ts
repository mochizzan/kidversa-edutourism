import type { Tenant } from '../types'
import { apiRequest } from './backendClient'

interface TenantsEnvelope {
  data: Tenant[]
  meta?: { page: number; limit: number; total: number }
}

export interface TenantService {
  getAll(): Promise<Tenant[]>
}

// getAll returns every tenant the caller is allowed to see. SUPER_ADMIN sees
// all tenants; ADMIN sees only their own tenant (enforced by the backend's
// TenantScope / usecase layer). The endpoint returns a paginated envelope; we
// unwrap the `data` array.
const getAll = async (): Promise<Tenant[]> => {
  const res = await apiRequest<TenantsEnvelope>('GET', '/api/tenants')
  return res.data ?? []
}

export const tenantService: TenantService = {
  getAll,
}
