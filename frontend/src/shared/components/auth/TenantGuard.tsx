import { Building2 } from 'lucide-react'
import { useTenantScope } from '../../../core/hooks/useTenantScope'
import { useAuth } from '../../../core/hooks/useAuth'
import { isSuperAdmin } from '../../../core/utils/permissions'
import { EmptyState } from '../feedback/EmptyState'

interface TenantGuardProps {
  children: React.ReactNode
}

export function TenantGuard({ children }: TenantGuardProps) {
  const { user } = useAuth()
  const { requiresSelection } = useTenantScope()

  if (isSuperAdmin(user) && requiresSelection) {
    return (
      <EmptyState
        icon={<Building2 className="w-12 h-12" />}
        title="Pilih Tenant Terlebih Dahulu"
        description="Gunakan pemilih tenant di sidebar untuk memilih tenant sebelum mengakses halaman operasional."
      />
    )
  }

  return <>{children}</>
}
