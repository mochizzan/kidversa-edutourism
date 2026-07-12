import { useEffect } from 'react'
import { Building2 } from 'lucide-react'
import { useTenantStore } from '../../../core/stores/tenantStore'
import { useAuth } from '../../../core/hooks/useAuth'
import type { Tenant } from '../../../core/types'
import { isSuperAdmin } from '../../../core/utils/permissions'
import { cn } from '../../../core/utils'

export function TenantSwitcher() {
  const { user } = useAuth()
  const { activeTenant, tenants, setActiveTenant, fetchTenants } = useTenantStore()

  useEffect(() => {
    if (!isSuperAdmin(user)) return
    if (tenants.length === 0) {
      void fetchTenants()
    }
  }, [user, tenants.length, fetchTenants])

  if (!isSuperAdmin(user)) return null

  return (
    <div className="relative">
      <select
        value={activeTenant?.id || ''}
        onChange={(e) => {
          const tenant = tenants.find((t: Tenant) => t.id === e.target.value) || null
          setActiveTenant(tenant)
        }}
        className={cn(
          'w-full px-3 py-2 pl-9 rounded-xl border text-sm outline-none transition-all duration-200 appearance-none',
          'bg-surface-container-low border-outline-variant/60',
          'focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/15',
          'text-on-surface',
        )}
      >
        <option value="">Pilih Tenant...</option>
        {tenants.map((t: Tenant) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
    </div>
  )
}
