import { create } from 'zustand'
import type { Tenant } from '../types'
import { UserRole } from '../types'
import { apiRequest } from '../services/backendClient'
import { useAuthStore } from './authStore'

const ACTIVE_TENANT_KEY = 'kidversa_active_tenant_id'

interface TenantsResponse {
  data: Tenant[]
}

interface TenantState {
  activeTenant: Tenant | null
  tenants: Tenant[]
  setActiveTenant: (tenant: Tenant | null) => void
  setTenants: (tenants: Tenant[]) => void
  fetchTenants: () => Promise<void>
  clearActiveTenant: () => void
}

export const useTenantStore = create<TenantState>((set) => ({
  activeTenant: null,
  tenants: [],

  setActiveTenant: (tenant) => {
    set({ activeTenant: tenant })
    if (tenant) {
      localStorage.setItem(ACTIVE_TENANT_KEY, tenant.id)
    } else {
      localStorage.removeItem(ACTIVE_TENANT_KEY)
    }
  },

  setTenants: (tenants) => {
    const savedId = localStorage.getItem(ACTIVE_TENANT_KEY)
    const active = tenants.find((t) => t.id === savedId) || null
    set({ tenants, activeTenant: active })
  },

  // TODO(Fase 4 S13): replace the inline apiRequest with tenantService.getAll().
  // For now this fetches tenants directly from the backend until the service
  // layer is built.
  fetchTenants: async () => {
    const res = await apiRequest<TenantsResponse>('GET', '/api/tenants')
    const tenants = res.data
    const savedId = localStorage.getItem(ACTIVE_TENANT_KEY)
    let active = tenants.find((t) => t.id === savedId) || null

    // SUPER_ADMIN auto-select: if no tenant is active yet, default to the
    // first tenant so tenant-scoped routes work immediately.
    if (!active) {
      const { user } = useAuthStore.getState()
      if (user?.role === UserRole.SUPER_ADMIN && tenants.length > 0) {
        active = tenants[0]
        localStorage.setItem(ACTIVE_TENANT_KEY, active.id)
      }
    }

    set({ tenants, activeTenant: active })
  },

  clearActiveTenant: () => {
    set({ activeTenant: null })
    localStorage.removeItem(ACTIVE_TENANT_KEY)
  },
}))
