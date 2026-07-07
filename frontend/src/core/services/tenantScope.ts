import { authSession } from './local/auth'
import { UserRole } from '../types/enums'

const ACTIVE_TENANT_KEY = 'kidversa_active_tenant_id'

export interface TenantScopeInfo {
  tenantId: string | null
  isSuperAdmin: boolean
  blocked: boolean
}

export function getTenantScope(): TenantScopeInfo {
  const user = authSession.getUser()
  if (!user) {
    return { tenantId: null, isSuperAdmin: false, blocked: true }
  }

  if (user.role === UserRole.SUPER_ADMIN) {
    const activeTenantId = localStorage.getItem(ACTIVE_TENANT_KEY)
    return {
      tenantId: activeTenantId || null,
      isSuperAdmin: true,
      blocked: !activeTenantId,
    }
  }

  return {
    tenantId: user.tenant_id ?? null,
    isSuperAdmin: false,
    blocked: !user.tenant_id,
  }
}

export function requireTenantId(explicitTenantId?: string | null): string {
  const scope = getTenantScope()
  const tenantId = explicitTenantId ?? scope.tenantId
  if (!tenantId) throw new Error('Tenant aktif belum dipilih')
  return tenantId
}
