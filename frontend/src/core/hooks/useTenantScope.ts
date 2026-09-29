import { useMemo } from 'react'
import { useAuth } from '../../core/hooks/useAuth'
import { useTenantStore } from '../stores/tenantStore'
import { isSuperAdmin } from '../utils/permissions'

interface TenantScope {
  tenantId: string | null
  requiresSelection: boolean
}

export function useTenantScope(): TenantScope {
  const { user } = useAuth()
  const { activeTenant } = useTenantStore()

  return useMemo(() => {
    if (!user) {
      return { tenantId: null, requiresSelection: false }
    }

    if (isSuperAdmin(user)) {
      return {
        tenantId: activeTenant?.id ?? null,
        requiresSelection: !activeTenant,
      }
    }

    const tenantId = user.tenant_id ?? null
    return {
      tenantId,
      requiresSelection: false,
    }
  }, [user, activeTenant])
}
