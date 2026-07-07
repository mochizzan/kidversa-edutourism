import { create } from 'zustand'
import type { Tenant } from '../types'

const ACTIVE_TENANT_KEY = 'kidversa_active_tenant_id'

interface TenantState {
  activeTenant: Tenant | null
  tenants: Tenant[]
  setActiveTenant: (tenant: Tenant | null) => void
  setTenants: (tenants: Tenant[]) => void
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

  clearActiveTenant: () => {
    set({ activeTenant: null })
    localStorage.removeItem(ACTIVE_TENANT_KEY)
  },
}))
