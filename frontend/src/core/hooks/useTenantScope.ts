import { useMemo } from 'react'
import { useAuth } from '../../core/hooks/useAuth'
import { useTenantStore } from '../stores/tenantStore'
import { isSuperAdmin } from '../utils/permissions'

interface TenantScope {
  tenantId: string | null
  activeTenant: import('../types').Tenant | null
  requiresSelection: boolean
  canAccessOperationalData: boolean
}

export function useTenantScope(): TenantScope {
  const { user } = useAuth()
  const { activeTenant } = useTenantStore()

  return useMemo(() => {
    if (!user) {
      return { tenantId: null, activeTenant: null, requiresSelection: false, canAccessOperationalData: false }
    }

    if (isSuperAdmin(user)) {
      return {
        tenantId: activeTenant?.id ?? null,
        activeTenant,
        requiresSelection: !activeTenant,
        canAccessOperationalData: !!activeTenant,
      }
    }

    const tenantId = user.tenant_id ?? null
    return {
      tenantId,
      activeTenant: null,
      requiresSelection: false,
      canAccessOperationalData: !!tenantId,
    }
  }, [user, activeTenant])
}
