import { create } from 'zustand'
import type { Tenant } from '../types'
import { UserRole } from '../types'
import { tenantService } from '../services/tenants'
import { useAuthStore } from './authStore'
import { STORAGE_KEYS } from '../constants/storage'

const ACTIVE_TENANT_KEY = STORAGE_KEYS.ACTIVE_TENANT_ID

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

  fetchTenants: async () => {
    // Cold-start seed race: backend may briefly return an empty tenant list
    // right after bootstrap. For SUPER_ADMIN (who needs a tenant to operate)
    // retry the GET with capped backoff; non-SA / no-auth paths are not
    // retried since an empty list is a legitimate bootstrap state. Total wait
    // stays under ~3s (400+800+1600ms = 2.8s).
    const isSA = useAuthStore.getState().user?.role === UserRole.SUPER_ADMIN
    let tenants = await tenantService.getPublic()
    const backoffs = [400, 800, 1600]
    for (let i = 0; i < backoffs.length && tenants.length === 0 && isSA; i++) {
      await new Promise((r) => setTimeout(r, backoffs[i]))
      tenants = await tenantService.getPublic()
    }

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
