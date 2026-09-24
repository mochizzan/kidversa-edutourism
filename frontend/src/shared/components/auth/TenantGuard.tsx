import { Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTenantScope } from '../../../core/hooks/useTenantScope'
import { useAuth } from '../../../core/hooks/useAuth'
import { isSuperAdmin } from '../../../core/utils/permissions'
import { EmptyState } from '../feedback/EmptyState'

interface TenantGuardProps {
  children: React.ReactNode
}

export function TenantGuard({ children }: TenantGuardProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { requiresSelection } = useTenantScope()

  if (isSuperAdmin(user) && requiresSelection) {
    return (
      <EmptyState
        icon={<Building2 className="w-12 h-12" />}
        title={t('admin.tenantGuard.title')}
        description={t('admin.tenantGuard.description')}
      />
    )
  }

  return <>{children}</>
}
